import * as fs from "fs";
import * as path from "path";
import type { SubVaultEntry } from "./types";

export interface SymlinkParams {
	sourcePath: string;
	vaultBasePath: string;
	vaultPath: string;
	name: string;
}

export interface SymlinkResult {
	success: boolean;
	message: string;
}

function getSymlinkType(): "dir" | "junction" {
	return process.platform === "win32" ? "junction" : "dir";
}

function safeRealpath(p: string): string {
	try {
		return fs.realpathSync(p);
	} catch {
		return path.resolve(p);
	}
}

function resolveTarget(vaultBasePath: string, vaultPath: string, name: string): string {
	return path.join(vaultBasePath, vaultPath, name);
}

function isSubdirectory(parent: string, child: string): boolean {
	const resolvedParent = path.resolve(parent) + path.sep;
	const resolvedChild = path.resolve(child) + path.sep;
	return resolvedChild.startsWith(resolvedParent);
}

export function validateCreate(params: SymlinkParams): SymlinkResult {
	const { sourcePath, vaultBasePath, vaultPath, name } = params;
	const resolvedSource = path.resolve(sourcePath);
	const resolvedVault = path.resolve(vaultBasePath);
	const targetPath = resolveTarget(vaultBasePath, vaultPath, name);

	if (!fs.existsSync(resolvedSource)) {
		return { success: false, message: `Source folder not found: ${sourcePath}` };
	}
	if (isSubdirectory(resolvedVault, resolvedSource)) {
		return { success: false, message: "Source folder is inside the vault — this would create a loop" };
	}
	if (isSubdirectory(resolvedSource, resolvedVault)) {
		return { success: false, message: "Vault is inside the source folder — this would create a loop" };
	}
	if (fs.existsSync(targetPath)) {
		try {
			const stat = fs.lstatSync(targetPath);
			if (stat.isSymbolicLink()) {
				return { success: false, message: `A symlink already exists at: ${targetPath}` };
			}
		} catch {
			// broken path — something is there
		}
		return { success: false, message: `A file or folder already exists at: ${targetPath}` };
	}
	return { success: true, message: "Validation passed" };
}

export function createSymlink(params: SymlinkParams): SymlinkResult {
	const { sourcePath, vaultBasePath, vaultPath, name } = params;
	const targetPath = resolveTarget(vaultBasePath, vaultPath, name);
	try {
		fs.symlinkSync(path.resolve(sourcePath), targetPath, getSymlinkType());
		return { success: true, message: `Symlink created: ${name}` };
	} catch (err) {
		return { success: false, message: `Failed to create symlink: ${err instanceof Error ? err.message : String(err)}` };
	}
}

export function removeSymlink(vaultBasePath: string, entry: SubVaultEntry): SymlinkResult {
	const targetPath = resolveTarget(vaultBasePath, entry.vaultPath, entry.name);
	try {
		const stat = fs.lstatSync(targetPath);
		if (!stat.isSymbolicLink()) {
			return { success: false, message: `Path is not a symlink — refusing to remove: ${targetPath}` };
		}
	} catch {
		return { success: true, message: "Symlink already removed" };
	}
	try {
		fs.unlinkSync(targetPath);
		return { success: true, message: `Symlink removed: ${entry.name}` };
	} catch (err) {
		return { success: false, message: `Failed to remove symlink: ${err instanceof Error ? err.message : String(err)}` };
	}
}

export function toggleSymlink(
	vaultBasePath: string,
	entry: SubVaultEntry,
): { result: SymlinkResult; active: boolean } {
	if (entry.active) {
		const result = removeSymlink(vaultBasePath, entry);
		return { result, active: result.success ? false : true };
	}

	const targetPath = path.join(vaultBasePath, entry.vaultPath, entry.name);
	try {
		const stat = fs.lstatSync(targetPath);
		if (stat.isSymbolicLink()) {
			const linkReal = safeRealpath(targetPath);
			const sourceReal = safeRealpath(entry.sourcePath);
			if (linkReal === sourceReal) {
				return { result: { success: true, message: "Symlink already exists" }, active: true };
			}
		}
	} catch {
		// doesn't exist — proceed
	}

	const params: SymlinkParams = {
		sourcePath: entry.sourcePath,
		vaultBasePath,
		vaultPath: entry.vaultPath,
		name: entry.name,
	};
	const validation = validateCreate(params);
	if (!validation.success) return { result: validation, active: false };
	const result = createSymlink(params);
	return { result, active: result.success };
}

export function validateEntry(
	vaultBasePath: string,
	entry: SubVaultEntry,
): { symlinkExists: boolean; sourceExists: boolean } {
	const targetPath = resolveTarget(vaultBasePath, entry.vaultPath, entry.name);

	let symlinkExists = false;
	try {
		symlinkExists = fs.lstatSync(targetPath).isSymbolicLink();
	} catch {
		// doesn't exist
	}

	return {
		symlinkExists,
		sourceExists: fs.existsSync(path.resolve(entry.sourcePath)),
	};
}
