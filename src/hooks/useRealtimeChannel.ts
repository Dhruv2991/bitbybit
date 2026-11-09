"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseRealtimeChannelOptions {
  channelName: string;
  presenceKey?: string;
  presenceData?: Record<string, unknown>;
  onPresenceSync?: (presenceState: Record<string, unknown[]>) => void;
  broadcastEvents?: {
    event: string;
    callback: (payload: any) => void;
  }[];
  postgresChanges?: {
    event: string;
    schema: string;
    table: string;
    filter?: string;
    callback: (payload: any) => void;
  }[];
  enabled?: boolean;
}

export function useRealtimeChannel({
  channelName,
  presenceKey,
  presenceData,
  onPresenceSync,
  broadcastEvents = [],
  postgresChanges = [],
  enabled = true,
}: UseRealtimeChannelOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const db = getSupabaseClient();
    const channelConfig = presenceKey
      ? { config: { presence: { key: presenceKey } } }
      : undefined;

    const channel = db.channel(channelName, channelConfig);
    channelRef.current = channel;

    // Presence sync
    if (onPresenceSync) {
      channel.on("presence", { event: "sync" }, () => {
        onPresenceSync(channel.presenceState());
      });
    }

    // Broadcast listeners
    for (const b of broadcastEvents) {
      channel.on("broadcast", { event: b.event }, ({ payload }) => {
        b.callback(payload);
      });
    }

    // Postgres changes
    for (const p of postgresChanges) {
      channel.on(
        "postgres_changes" as any,
        {
          event: p.event,
          schema: p.schema,
          table: p.table,
          filter: p.filter,
        },
        (payload: any) => {
          p.callback(payload);
        }
      );
    }

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && presenceData) {
        await channel.track(presenceData);
      }
    });

    return () => {
      if (typeof channel.unsubscribe === "function") {
        channel.unsubscribe();
      }
      if (typeof db.removeChannel === "function") {
        db.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [channelName, enabled, presenceKey]);

  const sendBroadcast = async (event: string, payload: unknown) => {
    if (channelRef.current) {
      return channelRef.current.send({
        type: "broadcast",
        event,
        payload,
      });
    }
  };

  const updatePresence = async (data: Record<string, unknown>) => {
    if (channelRef.current) {
      return channelRef.current.track(data);
    }
  };

  return {
    channel: channelRef.current,
    sendBroadcast,
    updatePresence,
  };
}

