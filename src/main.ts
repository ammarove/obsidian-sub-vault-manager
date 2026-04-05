import { Notice, Plugin, FileSystemAdapter } from "obsidian";
import { remote } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { PluginSettings, SubVaultEntry } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { validateCreate, createSymlink, removeSymlink, toggleSymlink, validateEntry } from "./symlink";
import { createSubVault, copyPluginsToVault, isExistingVault } from "./sub-vault";
import { SubVaultManagerSettingTab } from "./settings";
import { pickVaultFolder, pickSubVaultToToggle, promptSubVaultName, promptImportExistingVault } from "./modals";

export default class SubVaultManagerPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SubVaultManagerSettingTab(this.app, this));
		this.registerCommands();
		await this.validateOnLoad();
	}

	onunload(): void {
		// Intentionally empty: symlinks persist when plugin is disabled.
	}

	// --- Settings ---

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<PluginSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// --- Helpers ---

	getVaultBasePath(): string {
		return (this.app.vault.adapter as FileSystemAdapter).getBasePath();
	}

	// --- Commands ---

	private registerCommands(): void {
		this.addCommand({
			id: "create-sub-vault",
			name: "Create sub-vault",
			callback: () => this.createSubVaultFromPicker(),
		});

		this.addCommand({
			id: "import-sub-vault",
			name: "Import existing vault as sub-vault",
			callback: () => this.importSubVaultFromPicker(),
		});

		this.addCommand({
			id: "toggle-sub-vault",
			name: "Toggle sub-vault...",
			callback: async () => {
				if (this.settings.subVaults.length === 0) {
					new Notice("No sub-vaults to toggle");
					return;
				}
				const entry = await pickSubVaultToToggle(this.app, this.settings.subVaults);
				if (entry) await this.toggleSubVaultEntry(entry.id);
			},
		});
	}

	// --- Startup validation ---

	private async validateOnLoad(): Promise<void> {
		const basePath = this.getVaultBasePath();
		let anyChanged = false;
		const toRemove: string[] = [];

		for (const entry of this.settings.subVaults) {
			if (!entry.active) continue;

			const status = validateEntry(basePath, entry);

			if (!status.sourceExists) {
				if (status.symlinkExists) removeSymlink(basePath, entry);
				toRemove.push(entry.id);
				anyChanged = true;
				new Notice(`Source missing for "${entry.name}" — removed`);
				continue;
			}

			if (!status.symlinkExists) {
				const params = {
					sourcePath: entry.sourcePath,
					vaultBasePath: basePath,
					vaultPath: entry.vaultPath,
					name: entry.name,
				};
				const validation = validateCreate(params);
				if (validation.success) {
					const result = createSymlink(params);
					if (!result.success) {
						entry.active = false;
						anyChanged = true;
						new Notice(`Failed to restore "${entry.name}" — ${result.message}`);
					}
				} else {
					entry.active = false;
					anyChanged = true;
					new Notice(`Cannot restore "${entry.name}" — ${validation.message}`);
				}
			}
		}

		if (toRemove.length > 0) {
			this.settings.subVaults = this.settings.subVaults.filter((e) => !toRemove.includes(e.id));
		}
		if (anyChanged) await this.saveSettings();
	}

	// --- Create flow ---

	async createSubVaultFromPicker(): Promise<void> {
		const pickerResult = await remote.dialog.showOpenDialog({
			title: "Select parent folder for new sub-vault",
			properties: ["openDirectory"],
		});
		if (pickerResult.canceled || pickerResult.filePaths.length === 0) return;
		const parentPath = pickerResult.filePaths[0] as string;

		const folderName = await promptSubVaultName(this.app);
		if (!folderName) return;

		const basePath = this.getVaultBasePath();
		const mainObsidianPath = path.join(basePath, this.app.vault.configDir);

		const subVaultResult = createSubVault({
			parentPath,
			folderName,
			mainVaultObsidianPath: mainObsidianPath,
			configDir: this.app.vault.configDir,
		});

		if (!subVaultResult.success) {
			new Notice(`Sub-vault creation failed — ${subVaultResult.message}`);
			return;
		}
		if (subVaultResult.message.includes("config could not be copied")) {
			new Notice(subVaultResult.message);
		}

		const subVaultPath = subVaultResult.subVaultPath as string;

		const folder = await pickVaultFolder(this.app);
		if (folder === null) return;

		const entry: SubVaultEntry = {
			id: crypto.randomUUID(),
			name: folderName,
			sourcePath: subVaultPath,
			vaultPath: folder.path,
			active: false,
		};

		const added = await this.addSubVaultEntry(entry);
		if (!added) return;

		await this.addExclusionRule(entry);
	}

	// --- Import flow ---

	async importSubVaultFromPicker(): Promise<void> {
		const pickerResult = await remote.dialog.showOpenDialog({
			title: "Select existing vault to import",
			properties: ["openDirectory"],
		});
		if (pickerResult.canceled || pickerResult.filePaths.length === 0) return;
		const vaultPath = pickerResult.filePaths[0] as string;

		const configDir = this.app.vault.configDir;
		if (!isExistingVault(vaultPath, configDir)) {
			new Notice("Selected folder is not an Obsidian vault (no config folder found).");
			return;
		}

		const choice = await promptImportExistingVault(this.app, vaultPath);
		if (choice === null) return;

		if (choice === "link-and-copy-plugins") {
			const basePath = this.getVaultBasePath();
			const mainObsidianPath = path.join(basePath, configDir);
			const result = copyPluginsToVault(mainObsidianPath, vaultPath, configDir);
			if (!result.success) {
				new Notice(`Could not copy plugins — ${result.message}`);
			}
		}

		const folder = await pickVaultFolder(this.app);
		if (folder === null) return;

		const entry: SubVaultEntry = {
			id: crypto.randomUUID(),
			name: path.basename(vaultPath),
			sourcePath: vaultPath,
			vaultPath: folder.path,
			active: false,
		};

		const added = await this.addSubVaultEntry(entry);
		if (!added) return;

		await this.addExclusionRule(entry);
	}

	// --- CRUD ---

	async addSubVaultEntry(entry: SubVaultEntry): Promise<boolean> {
		const duplicate = this.settings.subVaults.find((e) => e.sourcePath === entry.sourcePath);
		if (duplicate) {
			new Notice(`This folder is already linked as "${duplicate.name}"`);
			return false;
		}

		const basePath = this.getVaultBasePath();
		const params = {
			sourcePath: entry.sourcePath,
			vaultBasePath: basePath,
			vaultPath: entry.vaultPath,
			name: entry.name,
		};

		const validation = validateCreate(params);
		if (!validation.success) {
			new Notice(validation.message);
			return false;
		}

		const result = createSymlink(params);
		if (!result.success) {
			new Notice(result.message);
			return false;
		}

		entry.active = true;
		this.settings.subVaults.push(entry);
		await this.saveSettings();
		new Notice(`Linked "${entry.name}"`);
		return true;
	}

	async removeSubVaultEntry(id: string): Promise<boolean> {
		const basePath = this.getVaultBasePath();
		const index = this.settings.subVaults.findIndex((e) => e.id === id);
		if (index === -1) return false;

		const entry = this.settings.subVaults[index];
		if (entry === undefined) return false;

		const status = validateEntry(basePath, entry);
		if (status.symlinkExists) {
			const result = removeSymlink(basePath, entry);
			if (!result.success) {
				new Notice(result.message);
				return false;
			}
		}

		await this.removeExclusionRule(entry);

		this.settings.subVaults.splice(index, 1);
		await this.saveSettings();
		new Notice(`Removed "${entry.name}"`);
		return true;
	}

	async toggleSubVaultEntry(id: string): Promise<boolean> {
		const basePath = this.getVaultBasePath();
		const entry = this.settings.subVaults.find((e) => e.id === id);
		if (!entry) return false;

		const { result, active } = toggleSymlink(basePath, entry);
		if (!result.success) {
			new Notice(result.message);
			return false;
		}

		entry.active = active;
		await this.saveSettings();
		new Notice(`${entry.name} ${active ? "activated" : "deactivated"}`);
		return true;
	}

	// --- Exclusion rules ---

	async addExclusionRule(entry: SubVaultEntry): Promise<void> {
		const basePath = this.getVaultBasePath();
		const configDir = this.app.vault.configDir;
		const appJsonPath = path.join(basePath, configDir, "app.json");

		const linkLocation = entry.vaultPath ? `${entry.vaultPath}/${entry.name}` : entry.name;
		const pattern = `${linkLocation}/${configDir}/**`;

		try {
			let config: Record<string, unknown> = {};
			try {
				config = JSON.parse(fs.readFileSync(appJsonPath, "utf8")) as Record<string, unknown>;
			} catch {
				// app.json may not exist yet
			}

			const excluded: string[] = Array.isArray(config["excludedFiles"])
				? (config["excludedFiles"] as string[])
				: [];

			if (!excluded.includes(pattern)) {
				excluded.push(pattern);
				config["excludedFiles"] = excluded;
				fs.writeFileSync(appJsonPath, JSON.stringify(config, null, 2), "utf8");
			}
		} catch (err) {
			new Notice(`Could not update exclusion rules: ${String(err)}`);
		}
	}

	async removeExclusionRule(entry: SubVaultEntry): Promise<void> {
		const basePath = this.getVaultBasePath();
		const configDir = this.app.vault.configDir;
		const appJsonPath = path.join(basePath, configDir, "app.json");

		const linkLocation = entry.vaultPath ? `${entry.vaultPath}/${entry.name}` : entry.name;
		const pattern = `${linkLocation}/${configDir}/**`;

		try {
			const config = JSON.parse(fs.readFileSync(appJsonPath, "utf8")) as Record<string, unknown>;
			if (Array.isArray(config["excludedFiles"])) {
				config["excludedFiles"] = (config["excludedFiles"] as string[]).filter((p) => p !== pattern);
				fs.writeFileSync(appJsonPath, JSON.stringify(config, null, 2), "utf8");
			}
		} catch {
			// nothing to clean up
		}
	}
}
