# Compile server on one VM

ADR 0005, option 1: one x86-64 VM in Mumbai runs the HTTPS proxy (Caddy), the compile API, one compile worker and Redis. Each compile runs in a fresh gVisor container on that VM. Nothing else runs on it. Only users signed in to the `codetochip` Firebase project can compile; guests are asked to sign in.

Cost, checked 2026-10-03: an e2-standard-2 in `asia-south1` is about $59 a month, plus about $7 for the disk and static IP. Stop the VM when nobody needs compiling.

## 1. Create the VM (once)

```sh
gcloud config set project codetochip
gcloud services enable compute.googleapis.com
gcloud compute addresses create compile --region asia-south1
gcloud compute instances create compile-1 \
  --zone asia-south1-a --machine-type e2-standard-2 \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-balanced \
  --address compile --tags compile-server
gcloud compute firewall-rules create allow-compile-https \
  --allow tcp:80,tcp:443 --target-tags compile-server
gcloud compute addresses describe compile --region asia-south1 --format 'value(address)'
```

The last command prints the static IP. Either point a domain's DNS A record at it, or use `<ip-with-dashes>.sslip.io` (for example `34-100-1-2.sslip.io`) as the hostname.

## 2. Install and start (on the VM)

```sh
gcloud compute ssh compile-1 --zone asia-south1-a
git clone https://github.com/navinkumar9866/codetochip.git && cd codetochip
sudo bash deploy/compile-vm/setup.sh   # first run creates .env and stops
nano deploy/compile-vm/.env            # set COMPILE_HOST
sudo bash deploy/compile-vm/setup.sh   # installs, builds the toolchain image (~10 min), starts
curl https://<COMPILE_HOST>/health     # {"ok":true}
```

## 3. Point the web app at it

Add `VITE_COMPILE_URL=https://<COMPILE_HOST>` to `apps/web/.env.production.local`, then `pnpm deploy:hosting`.

## Updating

```sh
cd codetochip && git pull
cd deploy/compile-vm && sudo docker compose up -d --build
# If board manifests or the toolchain changed:
sudo docker compose run --rm --no-deps compiler-worker pnpm --filter @codetochip/compiler worker:build
```

## Stopping and starting

`gcloud compute instances stop compile-1 --zone asia-south1-a` (and `start`). While stopped, only the disk and the static IP are billed. The containers start again on boot.
