# Free-tier hosting for NF Preflight (Node + SQLite, Docker, /data volume)

Researched 2026-10-29, primary sources only (official pricing/docs pages fetched that day). Anything not confirmed on a primary page is marked **unverified**. Free tiers change often: re-check before committing.

## Recommendation

1. **Oracle Cloud Always Free, region São Paulo (`sa-saopaulo-1`) or Vinhedo (`sa-vinhedo-1`).** It is the only free option with a real VM, a real disk (SQLite works normally), Docker, no sleep, and a Brazilian region. Catches: needs credit card + phone at signup; idle instances can be reclaimed (see below); the home region is fixed at signup; Always Free availability in a given region is **unverified** (the docs page does not confirm it for São Paulo; check the Console at signup). Run `docker compose` on one small VM, put Caddy in front for automatic HTTPS (you manage this yourself).
2. **Fallback if Oracle signup fails or is capacity-blocked: Hetzner (~EUR 6.49/mo, no Brazil region, so higher latency from Brazil) or Fly.io `gru` (paid, ~USD 2-7/mo + volume).** Fly is the smoothest Docker + volume + auto-HTTPS experience and has São Paulo, but is not free.
3. **Not suitable for the SQLite file:** Render Free (no disk, spins down), Cloud Run (ephemeral FS; GCS FUSE has no locking), Cloudflare Containers (no free allowance).

**Migration path when it grows:** the app is a plain container with a `/data` volume, so moving is "copy the SQLite file + redeploy". Oracle VM -> Fly.io `gru` machine + volume (or any VPS) with no code changes. Beyond a single writer, move SQLite to Postgres (Render/Fly/Cloud SQL).

## Comparison

| Provider | Docker | Persistent disk for SQLite | Custom domain + auto HTTPS | Sleep / cold start | São Paulo | Free limits | Time limit | Card | Main catch |
|---|---|---|---|---|---|---|---|---|---|
| Oracle Always Free | Yes (your own VM) | Yes, 200 GB block/boot total | You run Caddy/nginx (certs yourself) | None | Yes (GRU, VCP regions exist); free eligibility unverified | 2 A1 OCPU + 12 GB, or 2 AMD micro VMs (1 GB); 200 GB | Always Free has none; $300 trial 30 days | Yes + phone | Idle reclaim; 1 region only; A1 capacity |
| GCP Compute Engine e2-micro | Yes (your own VM) | Yes, 30 GB std PD | Self-managed | None | **No** (free only us-west1/us-central1/us-east1) | 1 e2-micro, 30 GB, 1 GB egress NA | Always free; $300 trial 90 days | Yes | US-only, 1 GB egress |
| GCP Cloud Run | Yes | **No** (ephemeral; GCS FUSE no file locking) | Yes, automatic | Scale to zero, cold starts | Region available (unverified on fetched page) | 2M req, 180k vCPU-s, 360k GiB-s | Always free | Yes | Unsuitable for SQLite |
| AWS Free plan | Yes (EC2/Lightsail) | Yes (EBS/Lightsail disk) | Self-managed | None | sa-east-1 exists (Lightsail pricing lists São Paulo) | $100 credit + up to $100 more | 6 months, then account closes/convert | Not stated on page (unverified) | Expires after 6 months |
| Azure | Yes (App Service Linux containers, VMs) | Unverified for free tier | Free tier: custom domain needs a paid tier | Unverified | Unverified | 12-month + 65 always-free services; B1s hours unverified | 12 months | Unverified | Free App Service tier cannot have custom DNS per Microsoft docs |
| Fly.io | Yes | Yes, volume $0.15/GB-mo | Yes, automatic; 10 certs free | Optional auto-stop | **Yes (`gru`)** | No free tier for new orgs; trial 2 h / 7 days | Trial only | Required | Paid: shared-cpu-1x 256 MB $2.19/mo (iad price) |
| Render | Yes | Paid only (disk on paid services) | Yes | Free spins down after 15 min, ~1 min wake | **No** (Oregon, Ohio, Virginia, Frankfurt, Singapore) | 750 h/mo free, no disk | None | Not required for free | Free = ephemeral FS |
| Railway | Yes | Yes, volume (0.5 GB trial/free, 5 GB hobby) | Yes | None stated | Region list not on fetched page (unverified) | $5 trial credit 30 d; Free plan $1/mo credit; Hobby $5/mo | Trial 30 days; volume data deleted 30 d after expiry | Post-paid card required | $1/mo credit is tiny |
| Koyeb | Yes | Unverified (volumes page not reachable) | Unverified | Scale-to-zero listed | **No** (FRA, WAS, SIN, TYO, PAR, us-east-1) | No free compute listed; Pro $29/mo | n/a | Unverified | No free compute found |
| Northflank | Yes | Yes (volumes listed in Sandbox; size unverified) | Unverified | Always on, no sleep | Unverified | Sandbox: up to $20/mo resources, 2 services | None stated | Not required to start | Regions/volume limits unverified |
| Cloudflare Containers | Yes | Disk is not documented as persistent | Yes (Workers) | Sleeps | n/a | No free allowance; needs $5/mo Workers Paid | n/a | n/a | Not for SQLite |
| Hetzner Cloud | Yes (VPS) | Yes | Self-managed | None | **No** (DE, FI, SG, US) | None | n/a | Yes | From EUR 6.49/mo ex-VAT |

## Per-provider notes

### Oracle Cloud Always Free
- Always Free: A1 Flex up to 1,500 OCPU-h and 9,000 GB-h/month (= 2 OCPU, 12 GB); up to two AMD E2.1.Micro (1/8 OCPU, 1 GB, 50 Mbps); 200 GB block storage combined. Idle reclaim: 7-day 95th-percentile CPU < 20% and network < 20% (and memory < 20% for A1). Always Free compute and block volumes must be in the home region. https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Trial $300 for 30 days; most users need phone + credit card; to keep A1 instances after the trial stay within 2 OCPU/12 GB, otherwise they are deleted after 30 days. https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Brazil regions: São Paulo `sa-saopaulo-1`, Vinhedo `sa-vinhedo-1`; free tenancies limited to one subscribed region. https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm
- Practical risk: a low-traffic validator will look "idle" and may be reclaimed. Whether upgrading to Pay As You Go removes reclaim risk is **unverified** (the page does not say). Keep a backup of `/data` off-box either way.

### Google Cloud
- e2-micro: one non-preemptible instance/month in us-west1, us-central1 or us-east1 only; 30 GB-month standard PD; 1 GB egress from North America. Cloud Run free: 2M requests, 360,000 GB-s, 180,000 vCPU-s. $300 credit valid 90 days, card required (temporary hold $0-1). https://docs.cloud.google.com/free/docs/free-cloud-features
- Cloud Run + Cloud Storage FUSE: not fully POSIX, no file locking, last write wins; so unsafe for SQLite. https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts
- Cloud Run ephemeral filesystem is general knowledge; the fetched page did not state it (**unverified** by primary page). Cloud Run pricing page content could not be retrieved (southamerica-east1 free eligibility **unverified**): https://cloud.google.com/run/pricing
- e2-micro in the US adds roughly 120-180 ms latency for Brazilian users (estimate, unverified).

### AWS
- Free plan: $100 on signup + up to $100 more by exploring services, 6 months; account closes after 6 months or when credits run out unless converted to Paid; 30+ services always free within limits. https://aws.amazon.com/free/ (the page did not mention card requirement, Lightsail or App Runner: **unverified**).
- Lightsail Linux from $5/mo (0.5 GB, 20 GB SSD, 1 TB); São Paulo has half the data transfer; containers from $7/mo (Nano). https://aws.amazon.com/lightsail/pricing/ (no free allowance listed).
- App Runner free status: **unverified**.

### Azure
- Free account has 12-month services plus 65+ always-free services; trial users must move to pay-as-you-go within 30 days to keep 12-month benefits. https://azure.microsoft.com/en-us/pricing/free-services (the page did not list the $200 credit, B1s hours, Container Apps free grant, or card requirement: **unverified**).
- App Service: custom DNS on the Free tier requires scaling to a higher tier. https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans . Persistent storage for SQLite on App Service/Container Apps, and Brazil South availability: **unverified**.

### Fly.io
- New organizations have no free tier; trial is 2 h of runtime or 7 days, no card for the trial, card needed afterwards. shared-cpu-1x 256 MB $2.19/mo (iad price), 512 MB $3.69, 1 GB $6.70; volumes $0.15/GB-mo; 10 certificates free; South America egress $0.04/GB. https://docs.fly.io/about/pricing
- `gru` (São Paulo) is listed; the regions page says it supports Managed Postgres but did not state Machines support explicitly: verify with `fly platform regions`. https://docs.fly.io/reference/regions/
- Best paid fallback: container + volume at `/data`, single machine (a volume attaches to one machine).

### Render
- Free web services: spin down after 15 min idle (~1 min to wake), no persistent disk (ephemeral FS), 750 h/month; free Postgres expires after 30 days. https://render.com/docs/free
- Disks only on paid services; single instance; a deploy causes a few seconds of downtime. https://render.com/docs/disks
- Regions: Oregon, Ohio, Virginia, Frankfurt, Singapore; no São Paulo. https://render.com/docs/regions . Starter/disk prices not retrieved (**unverified**).

### Railway
- Trial: one-time $5, 30 days, no card; Free plan $1/mo credit; volume 0.5 GB on Trial/Free, 5 GB Hobby; volume data deleted 30 days after a Free/Trial plan expires; post-paid card required. Hobby $5/mo. https://docs.railway.com/reference/pricing/plans and https://railway.com/pricing
- Regions: not on fetched pages (**unverified**).

### Koyeb
- No free compute on the pricing page (only a free 5 h serverless Postgres); Pro $29/mo. Regions have no South America. https://www.koyeb.com/pricing , https://www.koyeb.com/docs/reference/regions . Volumes: **unverified**.

### Northflank
- Sandbox: free, no card to start, up to $20/month of resources, 2 services, always on, volumes included (size unverified). https://northflank.com/pricing . Regions/São Paulo: **unverified** (regions docs URL returned 404).

### Cloudflare
- Containers allowances belong to the $5/mo Workers Paid plan; Free plan shows N/A; disk persistence is not documented as persistent. https://developers.cloudflare.com/containers/pricing/ . Could still be used as a free CDN/DNS/proxy in front of the VM (not researched).

### Hetzner
- Regular Performance from EUR 6.49/mo ex-VAT (Cost-Optimized listed as currently unavailable); locations Germany, Finland, Singapore, USA. No Brazil. https://www.hetzner.com/cloud/

## Deploying (what you must do)

1. Create the VM/app in the chosen provider and region (Oracle: home region São Paulo or Vinhedo, pick it carefully at signup, it cannot be changed).
2. Install Docker + compose plugin on the VM (Oracle/Hetzner). Open ports 80/443 (Oracle: both the VCN security list and the host firewall).
3. Mount a persistent volume at `/data` (VM: host dir `./data:/data`; Fly: `fly volumes create`, mount `/data`). Back up the SQLite file regularly (e.g. `sqlite3 .backup` + copy off-box).
4. Set env vars: `PORT` (app listens on it), `ADMIN_PASSWORD` (strong), `SITE_URL` (e.g. `https://your-domain.com.br`, no trailing slash), `DONATE_URL`. Keep them in a `.env` not committed.
5. Domain DNS: A record (and AAAA if IPv6) for the apex/`www` pointing to the VM IP (Fly/PaaS: the CNAME/A given by the provider). Use Caddy (auto HTTPS via Let's Encrypt) as reverse proxy to `app:PORT` on VMs; PaaS issues certs automatically after DNS validates. Optionally put Cloudflare DNS in front.
6. Single instance only (SQLite single writer); do not scale horizontally.
