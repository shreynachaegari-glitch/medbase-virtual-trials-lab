import { useSyncExternalStore } from "react";
import { getTransportState, subscribe, type TransportState } from "@/lib/trials/transport";

/** Where requests are going right now, and how the in-browser simulator is getting on. */
export const useTransport = (): TransportState => useSyncExternalStore(subscribe, getTransportState);
