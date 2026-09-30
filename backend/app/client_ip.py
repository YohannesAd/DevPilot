"""Resolve client IP from the untouched ASGI peer; launch with --no-proxy-headers."""
from ipaddress import ip_address
from fastapi import Request


def address(value):
    if "%" in value:  # Zone identifiers are not portable network identities.
        raise ValueError
    ip = ip_address(value)
    return getattr(ip, "ipv4_mapped", None) or ip


def client_ip(request: Request, trusted_proxies: tuple) -> str:
    verified = getattr(request.state, "verified_client_ip", None)
    if verified is not None:
        return verified  # Set only by the authenticated proxy middleware.
    try:
        peer = address(request.client.host) if request.client else None
    except ValueError:
        peer = None
    if peer is None:
        return "unknown"  # Missing/non-IP peers share a restrictive bucket, never bypass.
    trusted = lambda ip: any(ip in network for network in trusted_proxies)
    if not trusted(peer):
        return str(peer)
    headers = request.headers.getlist("x-forwarded-for")
    if len(headers) != 1 or len(headers[0]) > 2048:
        return str(peer)
    values = headers[0].split(",")
    if not 1 <= len(values) <= 20:
        return str(peer)
    try:
        chain = [address(value.strip()) for value in values]
    except ValueError:
        return str(peer)
    # Discard only trusted hops from the right; stop at the first untrusted hop.
    current = peer
    for hop in reversed(chain):
        if not trusted(current):
            break
        current = hop
    return str(current)
