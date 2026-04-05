import { App, FuzzySuggestModal, Modal, Setting, TFolder } from "obsidian";
import type { SubVaultEntry } from "./types";

// ---------------------------------------------------------------------------
// Vault folder picker
// ---------------------------------------------------------------------------

class VaultFolderModal extends FuzzySuggestModal<TFolder> {
	private folders: TFolder[];
	private onSelect: (folder: TFolder | null) => void;
	private picked = false;

	constructor(app: App, onSelect: (folder: TFolder | null) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder("Choose vault folder for sub-vault link...");
		this.folders = this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder);
	}

	getItems(): TFolder[] { return this.folders; }
	getItemText(folder: TFolder): string { return folder.path === "" ? "/" : folder.path; }

	onChooseItem(folder: TFolder): void {
		this.picked = true;
		this.onSelect(folder);
	}

	onClose(): void {
		setTimeout(() => { if (!this.picked) this.onSelect(null); }, 0);
	}
}

export function pickVaultFolder(app: App): Promise<TFolder | null> {
	return new Promise((resolve) => { new VaultFolderModal(app, resolve).open(); });
}

// ---------------------------------------------------------------------------
// Sub-vault name prompt
// ---------------------------------------------------------------------------

class SubVaultNameModal extends Modal {
	private onSubmit: (name: string | null) => void;
	private inputEl!: HTMLInputElement;

	constructor(app: App, onSubmit: (name: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "New sub-vault name" });
		contentEl.createEl("p", {
			text: "Enter the folder name for the new sub-vault. It will be created inside the directory you selected.",
		});

		const inputSetting = new Setting(contentEl).setName("Folder name");
		inputSetting.addText((text) => {
			this.inputEl = text.inputEl;
			text.setPlaceholder("Sub-vault folder name");
			text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter") this.submit();
			});
		});

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => {
				this.onSubmit(null);
				this.close();
			}))
			.addButton((btn) => btn.setButtonText("Create").setCta().onClick(() => this.submit()));
	}

	private submit(): void {
		const value = this.inputEl?.value.trim() ?? "";
		if (!value) return;
		this.onSubmit(value);
		this.close();
	}

	onClose(): void {
		// handled via the resolved flag in promptSubVaultName
	}
}

export function promptSubVaultName(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		let resolved = false;
		const modal = new SubVaultNameModal(app, (name) => {
			if (!resolved) { resolved = true; resolve(name); }
		});
		const originalClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			originalClose();
			setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 0);
		};
		modal.open();
	});
}

// ---------------------------------------------------------------------------
// Import existing vault modal
// ---------------------------------------------------------------------------

export type ImportVaultChoice = "link-only" | "link-and-copy-plugins" | null;

class ImportExistingVaultModal extends Modal {
	private vaultPath: string;
	private onChoice: (choice: ImportVaultChoice) => void;
	private chose = false;

	constructor(app: App, vaultPath: string, onChoice: (choice: ImportVaultChoice) => void) {
		super(app);
		this.vaultPath = vaultPath;
		this.onChoice = onChoice;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Import existing vault" });
		contentEl.createEl("p", { text: `"${this.vaultPath}" is an Obsidian vault.` });
		contentEl.createEl("p", { text: "Choose how to import it:" });

		new Setting(contentEl)
			.setName("Link only")
			.setDesc("Symlink this vault into the main vault. The vault keeps its own settings.")
			.addButton((btn) => btn.setButtonText("Link only").setCta().onClick(() => {
				this.chose = true;
				this.onChoice("link-only");
				this.close();
			}));

		new Setting(contentEl)
			.setName("Link and copy plugins")
			.setDesc("Same as above, and also copies the main vault's plugins folder into this vault, overwriting its existing plugins.")
			.addButton((btn) => btn.setButtonText("Link and copy plugins").onClick(() => {
				this.chose = true;
				this.onChoice("link-and-copy-plugins");
				this.close();
			}));

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		if (!this.chose) this.onChoice(null);
	}
}

export function promptImportExistingVault(app: App, vaultPath: string): Promise<ImportVaultChoice> {
	return new Promise((resolve) => { new ImportExistingVaultModal(app, vaultPath, resolve).open(); });
}

// ---------------------------------------------------------------------------
// Confirm remove sub-vault
// ---------------------------------------------------------------------------

class ConfirmRemoveModal extends Modal {
	private entryName: string;
	private onConfirm: (confirmed: boolean) => void;
	private confirmed = false;

	constructor(app: App, entryName: string, onConfirm: (confirmed: boolean) => void) {
		super(app);
		this.entryName = entryName;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Remove sub-vault link?" });
		contentEl.createEl("p", {
			text: `This will remove "${this.entryName}" from your managed sub-vaults, unlink it from the vault, and remove the config folder exclusion rule.`,
		});
		contentEl.createEl("p", { text: "The sub-vault folder on disk will not be deleted." });

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) => btn.setButtonText("Remove").setWarning().onClick(() => {
				this.confirmed = true;
				this.close();
			}));
	}

	onClose(): void { this.onConfirm(this.confirmed); }
}

export function confirmRemove(app: App, entryName: string): Promise<boolean> {
	return new Promise((resolve) => { new ConfirmRemoveModal(app, entryName, resolve).open(); });
}

// ---------------------------------------------------------------------------
// Toggle picker
// ---------------------------------------------------------------------------

class ToggleSubVaultModal extends FuzzySuggestModal<SubVaultEntry> {
	private entries: SubVaultEntry[];
	private onSelect: (entry: SubVaultEntry | null) => void;
	private picked = false;

	constructor(app: App, entries: SubVaultEntry[], onSelect: (entry: SubVaultEntry | null) => void) {
		super(app);
		this.entries = entries;
		this.onSelect = onSelect;
		this.setPlaceholder("Choose sub-vault to toggle...");
	}

	getItems(): SubVaultEntry[] { return this.entries; }
	getItemText(entry: SubVaultEntry): string {
		return `${entry.name} ${entry.active ? "(on)" : "(off)"}`;
	}
	onChooseItem(entry: SubVaultEntry): void { this.picked = true; this.onSelect(entry); }
	onClose(): void { setTimeout(() => { if (!this.picked) this.onSelect(null); }, 0); }
}

export function pickSubVaultToToggle(app: App, entries: SubVaultEntry[]): Promise<SubVaultEntry | null> {
	return new Promise((resolve) => { new ToggleSubVaultModal(app, entries, resolve).open(); });
}
