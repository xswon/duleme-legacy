import { useCallback, useEffect, useMemo, useState } from "react";
import { BidclubEpisode } from "../types";
import { fetchBidclubEpisode } from "../services/rssService";
import {
  canonicalBidclubEpisodeId,
  getCachedBidclubEpisode,
  setCachedBidclubEpisode,
} from "../services/bidclubEpisodeCache";

export function useBidclubEpisode(reference?: string) {
  const canonicalReference = useMemo(
    () => reference ? canonicalBidclubEpisodeId(reference) : undefined,
    [reference]
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<{
    reference?: string;
    episode: BidclubEpisode | null;
    loading: boolean;
    error: string | null;
  }>(() => {
    const cached = canonicalReference ? getCachedBidclubEpisode(canonicalReference) : null;
    return {
      reference: canonicalReference,
      episode: cached,
      loading: !!canonicalReference && !cached,
      error: null,
    };
  });

  useEffect(() => {
    if (!canonicalReference) {
      setState({ reference: canonicalReference, episode: null, loading: false, error: null });
      return;
    }
    const cachedEpisode = getCachedBidclubEpisode(canonicalReference);
    if (cachedEpisode) {
      setState({ reference: canonicalReference, episode: cachedEpisode, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ reference: canonicalReference, episode: null, loading: true, error: null });
    fetchBidclubEpisode(canonicalReference)
      .then((data) => {
        setCachedBidclubEpisode(canonicalReference, data);
        if (!cancelled) setState({ reference: canonicalReference, episode: data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            reference: canonicalReference,
            episode: null,
            loading: false,
            error: err instanceof Error ? err.message : "加载 BidClub 全文失败",
          });
        }
      });
    return () => { cancelled = true; };
  }, [canonicalReference, retryVersion]);

  const isCurrentReference = state.reference === canonicalReference;
  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);
  return {
    episode: isCurrentReference ? state.episode : null,
    loading: !!canonicalReference && (!isCurrentReference || state.loading),
    error: isCurrentReference ? state.error : null,
    retry,
  };
}
