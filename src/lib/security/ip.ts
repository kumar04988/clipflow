// Decides whether a network address or hostname is private/internal (SSRF protection).

import net from "node:net";

const BLOCKED_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, includes cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const BLOCKED_IPV6: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], // NAT64 (checked by its embedded IPv4 first, see embeddedIpv4)
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];

const blockList = new net.BlockList();
for (const [address, prefix] of BLOCKED_IPV4) blockList.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of BLOCKED_IPV6) blockList.addSubnet(address, prefix, "ipv6");

const BLOCKED_HOST_SUFFIXES = ["localhost", "local", "internal", "intranet", "lan", "home.arpa", "localdomain"];

/** Expands an IPv6 address to 8 numeric groups (handles "::" and embedded IPv4). */
function ipv6Groups(address: string): number[] | null {
  let value = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const v4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (v4Tail) {
    const octets = v4Tail[1].split(".").map(Number);
    value = `${value.slice(0, -v4Tail[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const [head, tail] = value.includes("::") ? value.split("::") : [value, null];
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === null ? headGroups.length !== 8 : missing < 0) return null;
  const groups = [...headGroups, ...Array(tail === null ? 0 : missing).fill("0"), ...tailGroups].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

/**
 * The IPv4 address inside an IPv4-mapped ("::ffff:7f00:1") or NAT64 ("64:ff9b::7f00:1") address, else null.
 * IPv6-only networks (common on mobile hotspots) answer DNS for IPv4-only sites with NAT64 addresses,
 * so those are judged by the IPv4 address they lead to.
 */
export function embeddedIpv4(address: string): string | null {
  const groups = ipv6Groups(address);
  if (!groups) return null;
  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
  if (!isMapped && !isNat64) return null;
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
}

/** True for loopback, private, link-local, metadata, multicast, reserved and malformed addresses. */
export function isBlockedAddress(address: string): boolean {
  const clean = address.replace(/^\[|\]$/g, "").split("%")[0];
  const family = net.isIP(clean);
  if (family === 4) return blockList.check(clean, "ipv4");
  if (family === 6) {
    const mapped = embeddedIpv4(clean);
    if (mapped) return blockList.check(mapped, "ipv4");
    return blockList.check(clean, "ipv6");
  }
  return true; // not an IP at all
}

/** Hostnames that only make sense on internal networks. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
