import dns from "node:dns/promises";
import net from "node:net";
import { isBlockedAddress, isBlockedHostname } from "./ip.ts";

export class BlockedDestinationError extends Error {
  constructor(message = "Destination is not a public internet address.") {
    super(message);
    this.name = "BlockedDestinationError";
  }
}

export class DnsLookupError extends Error {
  constructor(hostname: string) {
    super(`Could not resolve ${hostname}.`);
    this.name = "DnsLookupError";
  }
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * Resolves a hostname and returns an address only if *every* address it resolves to is public.
 * Callers must connect to the returned address (not re-resolve the name) to avoid DNS rebinding.
 */
export async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isBlockedHostname(host)) throw new BlockedDestinationError();

  const literalFamily = net.isIP(host);
  if (literalFamily) {
    if (isBlockedAddress(host)) throw new BlockedDestinationError();
    return { address: host, family: literalFamily };
  }

  let records: ResolvedAddress[];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new DnsLookupError(host);
  }
  if (records.length === 0) throw new DnsLookupError(host);
  if (records.some((record) => isBlockedAddress(record.address))) throw new BlockedDestinationError();
  return records[0];
}
