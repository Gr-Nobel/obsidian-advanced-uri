import { App, MarkdownView, normalizePath, Notice, Plugin, PluginSettingTab, Setting, SuggestModal, TFile } from "obsidian";
import { appHasDailyNotesPluginLoaded, createDailyNote, getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";

const DEFAULT_SETTINGS: AdvancedURISettings = {
    openFileOnWrite: true
};

interface AdvancedURISettings {
    openFileOnWrite: boolean;
}
interface Parameters {
    workspace: string;
    filepath: string;
    daily: "true";
    data: string;
    mode: "overwrite" | "append" | "prepend";
    heading: string;
    block: string;
}

export default class AdvancedURI extends Plugin {
    settings: AdvancedURISettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SettingsTab(this.app, this));

        this.registerObsidianProtocolHandler("advanced-uri", async (e) => {
            const parameters = e as unknown as Parameters;

            if (parameters.workspace) {
                this.handleWorkspace(parameters.workspace);

            } else if (parameters.filepath && parameters.data) {
                this.handleWrite(parameters);

            } else if (parameters.daily === "true") {
                this.handleDailyNote(parameters);

            } else if (parameters.filepath && parameters.heading) {
                this.app.workspace.openLinkText(parameters.filepath + "#" + parameters.heading, "");

            } else if (parameters.filepath && parameters.block) {
                this.app.workspace.openLinkText(parameters.filepath + "#^" + parameters.block, "");
            }
        });

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file: TFile, source: string) => {
                if (source !== "pane-more-options") {
                    return;
                }
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    return;
                }

                menu.addItem((item) => {
                    item.setTitle(`Copy Advanced URI`).setIcon('link')
                        .onClick((evt) => {
                            const pos = view.editor.getCursor();
                            const cache = this.app.metadataCache.getFileCache(view.file);
                            if (cache.headings) {
                                for (const heading of cache.headings) {
                                    if (heading.position.start.line <= pos.line && heading.position.end.line >= pos.line) {
                                        let url = this.buildURIBase(view.file.path) + `&heading=${heading.heading}`;
                                        navigator.clipboard.writeText(encodeURI(url));
                                        return;
                                    }
                                }
                            }
                            if (cache.blocks) {
                                for (const blockID of Object.keys(cache.blocks)) {
                                    const block = cache.blocks[blockID];
                                    if (block.position.start.line <= pos.line && block.position.end.line >= pos.line) {
                                        let url = this.buildURIBase(view.file.path) + `&block=${blockID}`;
                                        navigator.clipboard.writeText(encodeURI(url));
                                        return;
                                    }
                                }
                            }
                            new EnterDataModal(this, view.file.path).open();
                        });
                });
            }));
    }

    handleWorkspace(workspace: string) {
        const workspaces = (this.app as any)?.internalPlugins?.plugins?.workspaces;
        if (!workspaces) {
            new Notice("Cannot find Workspaces plugin. Please file an issue.");

        } else if (workspaces.enabled) {
            workspaces.instance.loadWorkspace(workspace);

        } else {
            new Notice("Workspaces plugin is not enabled");
        }
    }

    async handleWrite(parameters: Parameters) {
        let path = normalizePath(parameters.filepath);
        if (!path.endsWith(".md")) {
            path = path + ".md";
        }
        const file = this.app.vault.getAbstractFileByPath(path);

        if (parameters.mode === "overwrite") {
            this.writeAndOpenFile(path, parameters.data);

        } else if (parameters.mode === "prepend") {
            if (file instanceof TFile) {
                this.prepend(file, parameters.data);
            }

        } else if (parameters.mode === "append") {
            if (file instanceof TFile) {
                this.append(file, parameters.data);
            }

        } else if (file instanceof TFile) {
            new Notice("File already exists");

        } else {
            this.writeAndOpenFile(path, parameters.data);
        }
    }

    async handleDailyNote(parameters: Parameters) {
        if (!appHasDailyNotesPluginLoaded()) {
            new Notice("Daily notes plugin is not loaded");
            return;
        }
        const moment = (window as any).moment(Date.now());
        const allDailyNotes = getAllDailyNotes();
        let dailyNote = getDailyNote(moment, allDailyNotes);

        if (parameters.data && parameters.mode === "overwrite") {
            this.app.vault.adapter.write(dailyNote.path, parameters.data);

        } else if (parameters.data && parameters.mode === "prepend") {
            if (!dailyNote) {
                dailyNote = await createDailyNote(moment);
            }
            this.prepend(dailyNote, parameters.data);

        } else if (parameters.data && parameters.mode === "append") {
            if (!dailyNote) {
                dailyNote = await createDailyNote(moment);
            }
            this.append(dailyNote, parameters.data);

        } else if (parameters.data && dailyNote) {
            new Notice("File already exists");

        } else if (parameters.data) {
            dailyNote = await createDailyNote(moment);
            this.writeAndOpenFile(dailyNote.path, parameters.data);

        } else {
            if (!dailyNote) {
                dailyNote = await createDailyNote(moment);
            }
            this.app.workspace.openLinkText(dailyNote.path, "", this.settings.openFileOnWrite);
        }

    }

    async append(file: TFile, data: string) {
        const fileData = await this.app.vault.read(file);
        const dataToWrite = fileData + "\n" + data;
        this.writeAndOpenFile(file.path, dataToWrite);
    }

    async prepend(file: TFile, data: string) {
        const fileData = await this.app.vault.read(file);
        const dataToWrite = data + "\n" + fileData;
        this.writeAndOpenFile(file.path, dataToWrite);
    }

    async writeAndOpenFile(outputFileName: string, text: string) {
        await this.app.vault.adapter.write(outputFileName, text);
        if (this.settings.openFileOnWrite) {
            let fileIsAlreadyOpened = false;
            this.app.workspace.iterateAllLeaves(leaf => {
                if ((leaf.view as any).file?.path === outputFileName) {
                    fileIsAlreadyOpened = true;
                }
            });
            if (!fileIsAlreadyOpened)
                this.app.workspace.openLinkText(outputFileName, "", true);
        }
    }

    buildURIBase(file: string) {
        return `obsidian://advanced-uri?vault=${this.app.vault.getName()}&filepath=${file}`;
    }

    async loadSettings() {
        this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
class SettingsTab extends PluginSettingTab {
    plugin: AdvancedURI;
    constructor(app: App, plugin: AdvancedURI) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: this.plugin.manifest.name });

        new Setting(containerEl)
            .setName("Open file in a pane on write")
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.openFileOnWrite = value;
                this.plugin.saveSettings();
            }).setValue(this.plugin.settings.openFileOnWrite));

    }
}

class EnterDataModal extends SuggestModal<string> {
    plugin: AdvancedURI;
    modes = ["overwrite", "append", "prepend"];
    file: string;

    constructor(plugin: AdvancedURI, file: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.setPlaceholder("Type your data to be written to the file");
        this.file = file;
    }


    getSuggestions(query: string): string[] {
        if (query == "") query = "...";
        return [query, ...this.modes.map(e => `${query} in ${e} mode`)];
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.innerText = value;
    }

    onChooseSuggestion(item: string, _: MouseEvent | KeyboardEvent): void {
        for (const mode of this.modes) {
            if (item.endsWith(` in ${mode} mode`)) {
                const data = item.substring(0, item.indexOf(` in ${mode} mode`));
                const uri = this.plugin.buildURIBase(this.file) + `&data=${data}&mode=${mode}`;
                navigator.clipboard.writeText(encodeURI(uri));
                return;
            }
        }
        const uri = this.plugin.buildURIBase(this.file) + `&data=${item}`;
        navigator.clipboard.writeText(encodeURI(uri));
    }
}
