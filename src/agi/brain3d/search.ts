import type { BrainModel, SearchResult } from "./types";

type SearchDocument = SearchResult & { text: string };

export class BrainSearchIndex {
  private documents: SearchDocument[] = [];

  constructor(model: BrainModel) {
    this.rebuild(model);
  }

  rebuild(model: BrainModel) {
    const regions: SearchDocument[] = model.regions.map((region) => ({
      id: region.id,
      name: region.name,
      kind: "REGION",
      detail: `${region.abbreviation} / ${region.hemisphere}`,
      text: `${region.id} ${region.name} ${region.abbreviation} ${region.category} ${region.hemisphere}`.toLowerCase(),
    }));
    const neurons: SearchDocument[] = model.neurons.map((neuron) => ({
      id: neuron.id,
      name: neuron.name,
      kind: "NEURON",
      detail: `${neuron.cellType} / ${neuron.region}`,
      text: `${neuron.id} ${neuron.name} ${neuron.cellType} ${neuron.region} ${neuron.hemisphere} ${String(neuron.metadata.annotation ?? "")}`.toLowerCase(),
    }));
    this.documents = [...regions, ...neurons];
  }

  search(query: string, limit = 30): SearchResult[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const starts: SearchResult[] = [];
    const contains: SearchResult[] = [];
    for (const document of this.documents) {
      if (!document.text.includes(normalized)) continue;
      const result = { id: document.id, name: document.name, kind: document.kind, detail: document.detail };
      if (document.name.toLowerCase().startsWith(normalized) || document.id.toLowerCase().startsWith(normalized)) starts.push(result);
      else contains.push(result);
      if (starts.length + contains.length >= limit * 2) break;
    }
    return [...starts, ...contains].slice(0, limit);
  }
}