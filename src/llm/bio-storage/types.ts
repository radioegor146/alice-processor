export interface BioDataFields {
    voicePrintId: string;
    name?: string;
    finished: boolean;
}

export interface BioData extends BioDataFields {
    id: number;
}

export interface BioStorage {
    initialize(): Promise<void>;

    add(data: BioDataFields): Promise<number>;

    save(data: BioData): Promise<number>;

    load(id: number): Promise<BioData | null>;

    loadByVoicePrintId(voicePrintId: string): Promise<BioData | null>;
}