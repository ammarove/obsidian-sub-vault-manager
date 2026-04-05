import { PluginSettingTab, Setting, App } from "obsidian";
import type SubVaultManagerPlugin from "./main";
import { validateEntry } from "./symlink";
import { confirmRemove } from "./modals";

export class SubVaultManagerSettingTab extends PluginSettingTab {
	plugin: SubVaultManagerPlugin;

	constructor(app: App, plugin: SubVaultManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Create sub-vault")
			.setDesc("Create a new Obsidian vault folder and link it into this vault — the sub-vault can be opened independently")
			.addButton((btn) =>
				btn.setButtonText("Create").setCta().onClick(async () => {
					await this.plugin.createSubVaultFromPicker();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName("Import existing vault")
			.setDesc("Link an existing Obsidian vault into this vault as a sub-vault, with the option to copy plugins")
			.addButton((btn) =>
				btn.setButtonText("Import").onClick(async () => {
					await this.plugin.importSubVaultFromPicker();
					this.display();
				}),
			);

		if (this.plugin.settings.subVaults.length === 0) {
			containerEl.createEl("p", {
				text: "No sub-vaults configured yet.",
				cls: "setting-item-description",
			});
			return;
		}

		new Setting(containerEl).setName("Managed sub-vaults").setHeading();

		const basePath = this.plugin.getVaultBasePath();

		for (const entry of this.plugin.settings.subVaults) {
			const status = validateEntry(basePath, entry);
			const statusWarning = !status.sourceExists
				? " ⚠ source missing"
				: entry.active && !status.symlinkExists
					? " ⚠ symlink broken"
					: "";

			const setting = new Setting(containerEl)
				.setName(entry.name)
				.setDesc(`${entry.sourcePath} → ${entry.vaultPath || "/"}`);

			if (statusWarning) {
				setting.nameEl.createSpan({ text: statusWarning, cls: "mod-warning" });
			}

			setting.addToggle((toggle) =>
				toggle.setValue(entry.active).onChange(async () => {
					await this.plugin.toggleSubVaultEntry(entry.id);
					this.display();
				}),
			);

			setting.addExtraButton((btn) =>
				btn.setIcon("trash").setTooltip("Remove sub-vault link").onClick(async () => {
					const confirmed = await confirmRemove(this.app, entry.name);
					if (!confirmed) return;
					await this.plugin.removeSubVaultEntry(entry.id);
					this.display();
				}),
			);
		}
	}
}
