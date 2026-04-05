// Internal record of a linked sub-vault.
export interface SubVaultEntry {
	id: string;
	name: string;
	sourcePath: string; // absolute path to the sub-vault on disk
	vaultPath: string;  // vault-relative folder where the symlink lives (empty = root)
	active: boolean;
}

export interface PluginSettings {
	subVaults: SubVaultEntry[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
	subVaults: [],
};
