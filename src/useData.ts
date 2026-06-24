import { useEffect, useState } from "react";
import type { AppData, OverlayData } from "./types";
import type {
  FingerprintViewModel,
  HeartbeatViewModel,
  LineageViewModel,
} from "./viewModelTypes";

const load = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json() as Promise<T>;
};

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      load<AppData["objects"]>("./data/objects.json"),
      load<AppData["comparisons"]>("./data/comparison_groups.json"),
      load<AppData["integration"]>("./data/integration_report.json"),
      load<AppData["validation"]>("./data/validation_report.json"),
      load<AppData["collections"]>("./data/collections.json"),
      load<AppData["allVersions"]>("./data/all_versions.json")
    ]).then(([objects, comparisons, integration, validation, collections, allVersions]) => {
      setData({ objects, comparisons, integration, validation, collections, allVersions });
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);
  return { data, error };
}

export const loadOverlay = (versionId: string) => load<OverlayData>(`./data/curated_overlays/${versionId}.json`);

export const loadLineageViewModel = () =>
  load<LineageViewModel>("./data/view_model/lineage_view_model.json");
export const loadFingerprintViewModel = () =>
  load<FingerprintViewModel>("./data/view_model/fingerprint_view_model.json");
export const loadHeartbeatViewModel = () =>
  load<HeartbeatViewModel>("./data/view_model/heartbeat_view_model.json");

function useViewModel<T>(loader: () => Promise<T>) {
  const [vm, setVm] = useState<T | null>(null);
  const [vmError, setVmError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loader()
      .then((value) => {
        if (!cancelled) setVm(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setVmError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { vm, vmError };
}

export const useLineageViewModel = () => useViewModel(loadLineageViewModel);
export const useFingerprintViewModel = () => useViewModel(loadFingerprintViewModel);
export const useHeartbeatViewModel = () => useViewModel(loadHeartbeatViewModel);
