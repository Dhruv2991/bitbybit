"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LOUNGE_CONFIG } from "@/config/community";

export type AudioStation = (typeof LOUNGE_CONFIG.STATIONS)[number];

export interface LoungeAudioContextValue {
  isPlaying: boolean;
  selectedStation: AudioStation;
  volume: number;
  audioError: boolean;
  failingStationName: string | null;
  togglePlay: () => void;
  handleSelectStation: (st: AudioStation) => void;
  handleVolumeChange: (vol: number) => void;
}

let globalAudioInstance: HTMLAudioElement | null = null;

function getOrCreateGlobalAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!globalAudioInstance) {
    const audio = new Audio();
    audio.preload = "auto";
    globalAudioInstance = audio;
  }
  return globalAudioInstance;
}

const LoungeAudioCtx = createContext<LoungeAudioContextValue | null>(null);

function useStandaloneLoungeAudio(): LoungeAudioContextValue {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStation, setSelectedStation] = useState<AudioStation>(LOUNGE_CONFIG.STATIONS[0]);
  const [volume, setVolume] = useState(0.65);
  const [audioError, setAudioError] = useState(false);
  const [failingStationName, setFailingStationName] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function getAudio(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }

  const togglePlay = () => {
    const audio = getAudio();
    if (!audio) return;
    setAudioError(false);
    setFailingStationName(null);

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (!audio.src || !audio.src.includes(selectedStation.url)) {
      audio.src = selectedStation.url;
      audio.load();
    }
    audio.volume = volume;

    console.log("[LoungeAudio] Playing audio src:", audio.src);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAudioError(false);
          setFailingStationName(null);
        })
        .catch((err: unknown) => {
          const errorName = err instanceof Error ? err.name : "UnknownError";
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[LoungeAudio] play() failed: ${errorName} - ${errorMessage}`, err);
          setAudioError(true);
          setFailingStationName(selectedStation.name);
          setIsPlaying(false);
        });
    }
  };

  const handleSelectStation = (st: AudioStation) => {
    setSelectedStation(st);
    setAudioError(false);
    setFailingStationName(null);

    const audio = getAudio();
    if (!audio) return;

    if (selectedStation.id !== st.id || !audio.src || !audio.src.includes(st.url)) {
      audio.src = st.url;
      audio.load();
    }
    audio.volume = volume;

    console.log("[LoungeAudio] Switching station & playing audio src:", audio.src);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAudioError(false);
          setFailingStationName(null);
        })
        .catch((err: unknown) => {
          const errorName = err instanceof Error ? err.name : "UnknownError";
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[LoungeAudio] play() failed: ${errorName} - ${errorMessage}`, err);
          setAudioError(true);
          setFailingStationName(st.name);
          setIsPlaying(false);
        });
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    const audio = getAudio();
    if (audio) audio.volume = v;
  };

  return {
    isPlaying,
    selectedStation,
    volume,
    audioError,
    failingStationName,
    togglePlay,
    handleSelectStation,
    handleVolumeChange,
  };
}

export function LoungeAudioProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStation, setSelectedStation] = useState<AudioStation>(LOUNGE_CONFIG.STATIONS[0]);
  const [volume, setVolume] = useState(0.65);
  const [audioError, setAudioError] = useState(false);
  const [failingStationName, setFailingStationName] = useState<string | null>(null);

  useEffect(() => {
    const audio = getOrCreateGlobalAudio();
    if (!audio) return;

    const onPlaying = () => {
      setIsPlaying(true);
      setAudioError(false);
      setFailingStationName(null);
    };

    const onError = () => {
      console.error("[LoungeAudio] Global audio error:", audio.error);
      setAudioError(true);
      setFailingStationName(selectedStation.name);
      setIsPlaying(false);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", onError);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("pause", onPause);
    };
  }, [selectedStation.name]);

  const togglePlay = useCallback(() => {
    const audio = getOrCreateGlobalAudio();
    if (!audio) return;
    setAudioError(false);
    setFailingStationName(null);

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (!audio.src || !audio.src.includes(selectedStation.url)) {
      audio.src = selectedStation.url;
      audio.load();
    }
    audio.volume = volume;

    console.log("[LoungeAudio] Playing audio src:", audio.src);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAudioError(false);
          setFailingStationName(null);
        })
        .catch((err: unknown) => {
          const errorName = err instanceof Error ? err.name : "UnknownError";
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[LoungeAudio] play() failed: ${errorName} - ${errorMessage}`, err);
          setAudioError(true);
          setFailingStationName(selectedStation.name);
          setIsPlaying(false);
        });
    }
  }, [isPlaying, selectedStation, volume]);

  const handleSelectStation = useCallback(
    (st: AudioStation) => {
      setSelectedStation(st);
      setAudioError(false);
      setFailingStationName(null);

      const audio = getOrCreateGlobalAudio();
      if (!audio) return;

      if (selectedStation.id !== st.id || !audio.src || !audio.src.includes(st.url)) {
        audio.src = st.url;
        audio.load();
      }
      audio.volume = volume;

      console.log("[LoungeAudio] Switching station & playing audio src:", audio.src);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setAudioError(false);
            setFailingStationName(null);
          })
          .catch((err: unknown) => {
            const errorName = err instanceof Error ? err.name : "UnknownError";
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`[LoungeAudio] play() failed: ${errorName} - ${errorMessage}`, err);
            setAudioError(true);
            setFailingStationName(st.name);
            setIsPlaying(false);
          });
      }
    },
    [selectedStation.id, volume]
  );

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    const audio = getOrCreateGlobalAudio();
    if (audio) {
      audio.volume = v;
    }
  }, []);

  const value = useMemo(
    () => ({
      isPlaying,
      selectedStation,
      volume,
      audioError,
      failingStationName,
      togglePlay,
      handleSelectStation,
      handleVolumeChange,
    }),
    [isPlaying, selectedStation, volume, audioError, failingStationName, togglePlay, handleSelectStation, handleVolumeChange]
  );

  return <LoungeAudioCtx.Provider value={value}>{children}</LoungeAudioCtx.Provider>;
}

export function useLoungeAudio(): LoungeAudioContextValue {
  const ctx = useContext(LoungeAudioCtx);
  const standalone = useStandaloneLoungeAudio();
  return ctx || standalone;
}

