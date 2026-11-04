# Demo Network Exposure Contract

## Allowed Ingress

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| 80 | TCP | `0.0.0.0/0` | Redirect/ACME HTTP validation for HTTPS |
| 443 | TCP | `0.0.0.0/0` | Public Caddy HTTPS |
| 22 | TCP | Operator-provided public CIDR only | SSH administration and protected data transfer |

No other inbound rule is permitted. In particular, Neo4j Bolt/HTTP and the application API are private to the server's Docker network and are not directly published to the public interface.

## Operational Requirements

- Require a concrete, current SSH source CIDR; reject a missing or broad SSH range.
- Preserve SSH host-key verification for file transfer and remote commands.
- Caddy is the only public application entry point and proxies the existing `/api` routes.
- The public hostname resolves to the allocated Elastic IP; readiness requires a valid certificate.
- Teardown releases the Elastic IP and removes the security group, instance, key-pair resource, and budget alert created by the stack.
- This contract bounds intended exposure but does not replace the required explicit security review before the first public apply.
