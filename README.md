# Sub-vault Manager

An Obsidian plugin for managing sub-vaults — create or import Obsidian vaults and link them into your main vault as symlinked folders.

Sub-vaults let you maintain independent Obsidian vaults (each with their own settings, plugins, and themes) while browsing their content from within your main vault.

## Features

- **Create sub-vault** — Pick a parent directory, name the new vault, and it's created with a copy of your main vault's config (plugins, themes, settings). The sub-vault is then symlinked into your main vault.
- **Import existing vault** — Select an existing Obsidian vault and link it into your main vault. Optionally copy your main vault's plugins into it.
- **Config folder exclusion** — The sub-vault's config folder is automatically hidden from the main vault's file explorer and search.
- **Toggle on/off** — Enable or disable sub-vault links without losing the configuration.

## Installation

### Manual
1. Download `main.js` and `manifest.json` from the latest release
2. Create a folder `sub-vault-manager` inside your vault's `.obsidian/plugins/` directory
3. Place both files in that folder
4. Reload Obsidian and enable the plugin in Settings → Community Plugins

## Usage

Open the plugin settings or use the command palette:

- **Create sub-vault** — Picks a parent folder, prompts for a name, creates the vault, and symlinks it in
- **Import existing vault as sub-vault** — Picks an existing vault folder, offers to copy plugins, and symlinks it in
- **Toggle sub-vault** — Enable or disable a sub-vault link

## Related

This plugin was extracted from [Symlink Manager](https://github.com/glassvault-ai/obsidian-symlink-manager), a general-purpose plugin for managing folder symlinks in Obsidian. If you need to link arbitrary external folders into your vault (not just Obsidian vaults), check out Symlink Manager instead.

## Requirements

- Desktop only (uses filesystem symlinks)
- Obsidian 0.15.0+

## License

MIT
