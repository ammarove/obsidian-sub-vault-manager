declare module "electron" {
	interface OpenDialogReturnValue {
		canceled: boolean;
		filePaths: string[];
	}

	interface OpenDialogOptions {
		title?: string;
		properties?: Array<"openDirectory" | "openFile" | "multiSelections">;
	}

	interface Dialog {
		showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
	}

	interface Remote {
		dialog: Dialog;
	}

	export const remote: Remote;
}
