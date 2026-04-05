import * as fs from "fs";
import * as path from "path";

export interface CreateSubVaultParams {
	parentPath: string;
	folderName: string;
	mainVaultObsidianPath: string;
	configDir: string;
}

export interface SubVaultResult {
	success: boolean;
	message: string;
	subVaultPath?: string;
}

function copyDirSync(src: string, dest: string): void {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirSync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

export function isExistingVault(folderPath: string, configDir: string): boolean {
	try {
		fs.lstatSync(folderPath);
		fs.lstatSync(path.join(folderPath, configDir));
		return true;
	} catch {
		return false;
	}
}

export function copyPluginsToVault(
	mainVaultObsidianPath: string,
	targetVaultPath: string,
	configDir: string,
): SubVaultResult {
	const srcPlugins = path.join(mainVaultObsidianPath, "plugins");
	const destPlugins = path.join(targetVaultPath, configDir, "plugins");

	try {
		fs.lstatSync(srcPlugins);
	} catch {
		return { success: false, message: "No plugins folder found in the main vault." };
	}
	try {
		copyDirSync(srcPlugins, destPlugins);
	} catch (err) {
		return { success: false, message: `Failed to copy plugins: ${String(err)}` };
	}
	return { success: true, message: "Plugins copied successfully.", subVaultPath: targetVaultPath };
}

export function createSubVault(params: CreateSubVaultParams): SubVaultResult {
	const { parentPath, folderName, mainVaultObsidianPath, configDir } = params;

	const trimmed = folderName.trim();
	if (!trimmed) {
		return { success: false, message: "Folder name cannot be empty." };
	}
	if (trimmed.includes("/") || trimmed.includes("\\")) {
		return { success: false, message: "Folder name cannot contain path separators." };
	}

	const subVaultPath = path.join(parentPath, trimmed);

	try {
		fs.lstatSync(subVaultPath);
		const hasConfig = (() => {
			try { fs.lstatSync(path.join(subVaultPath, configDir)); return true; } catch { return false; }
		})();
		return {
			success: false,
			message: hasConfig
				? "That folder is already an Obsidian vault. Use 'Import existing vault' to link it."
				: "A file or folder already exists at that path. Choose a different name.",
		};
	} catch {
		// path doesn't exist — good
	}

	try {
		fs.mkdirSync(subVaultPath, { recursive: true });
	} catch (err) {
		return { success: false, message: `Failed to create folder: ${String(err)}` };
	}

	const destObsidian = path.join(subVaultPath, configDir);
	try {
		fs.lstatSync(destObsidian);
		// already exists somehow — skip copy but still succeed
		return { success: true, message: `Sub-vault created at: ${subVaultPath}`, subVaultPath };
	} catch {
		// expected — proceed with copy
	}

	try {
		copyDirSync(mainVaultObsidianPath, destObsidian);
	} catch (err) {
		return {
			success: true,
			message: `Sub-vault folder created, but config could not be copied: ${String(err)}`,
			subVaultPath,
		};
	}

	return { success: true, message: `Sub-vault created at: ${subVaultPath}`, subVaultPath };
}
