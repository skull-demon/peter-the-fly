import { useSyncExternalStore } from "react";
import { brain } from "./runtime";

export const useBrainRuntime = () => {
  useSyncExternalStore(brain.subscribe, brain.getRevision, brain.getRevision);
  return brain;
};

export const useBrainModelRevision = () => useSyncExternalStore(brain.subscribe, brain.getModelRevision, brain.getModelRevision);