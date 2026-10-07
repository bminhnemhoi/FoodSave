import "server-only";

import { serverEnv } from "@/server/env";

import { ProviderError } from "../types";
import { createFakeMapsProvider } from "./fake";
import { createGoongProvider } from "./goong";
import type { MapsProvider } from "./types";

let instance: MapsProvider | undefined;

/** Provider bản đồ theo MAPS_PROVIDER (ADR-003, ADR-006). */
export function getMapsProvider(): MapsProvider {
  if (instance) return instance;
  switch (serverEnv.MAPS_PROVIDER) {
    case "goong":
      instance = createGoongProvider(serverEnv.GOONG_API_KEY ?? "");
      break;
    case "fake":
      instance = createFakeMapsProvider();
      break;
    default:
      throw new ProviderError(
        serverEnv.MAPS_PROVIDER,
        "unavailable",
        "Provider bản đồ chưa được hiện thực",
        false,
      );
  }
  return instance;
}

export type { MapsProvider } from "./types";
