# Compile service on Cloud Run

ADR 0005: the compile API and toolchain run as one Cloud Run service in Mumbai, in its own Cloud project (`codetochip-510518`), so it can't reach users' data. It scales to zero when nobody compiles. Only users signed in to the `codetochip` Firebase project can compile.

How a compile is sandboxed (CLAUDE.md rule 4):

- **gVisor.** Cloud Run's first-generation environment runs every instance in gVisor.
- **One compile per instance at a time** (`--concurrency 1`).
- **A clean work folder.** `/work` is emptied before and after every job, and the job sees only the toolchain's environment variables.
- **No internet.** All traffic leaves through `compile-net`, a VPC with no NAT. Private Google Access lets the API fetch Firebase's public signing keys.
- **No permissions.** The service runs as `compile-run`, a service account with no roles.
- **Bounded bill.** `--max-instances` caps cost and parallel compiles.

## 1. Set up (once)

```sh
gcloud config set project codetochip-510518
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com compute.googleapis.com iam.googleapis.com
gcloud artifacts repositories create compile --repository-format docker --location asia-south1
gcloud iam service-accounts create compile-run --display-name "Compile service (no roles)"
gcloud compute networks create compile-net --subnet-mode custom
gcloud compute networks subnets create compile-run --network compile-net \
  --region asia-south1 --range 10.8.0.0/24 --enable-private-ip-google-access
```

## 2. Build and deploy (each update)

```sh
IMAGE=asia-south1-docker.pkg.dev/codetochip-510518/compile/compiler:$(git rev-parse --short HEAD)
gcloud builds submit --config deploy/cloud-run/cloudbuild.yaml --substitutions _IMAGE=$IMAGE
gcloud run deploy compiler --image $IMAGE --region asia-south1 \
  --execution-environment gen1 --concurrency 1 --max-instances 10 --min-instances 0 \
  --cpu 1 --memory 2Gi --cpu-boost --timeout 120 \
  --service-account compile-run@codetochip-510518.iam.gserviceaccount.com \
  --network compile-net --subnet compile-run --vpc-egress all-traffic \
  --allow-unauthenticated \
  --set-env-vars '^;^TRUST_PROXY=1;FIREBASE_PROJECT_ID=codetochip;COMPILES_PER_MINUTE=30;ALLOWED_ORIGINS=https://codetochip.in,https://www.codetochip.in,https://codetochip.web.app,https://codetochip.firebaseapp.com'
```

The build takes about 10 minutes, because it builds the toolchain image too. `--allow-unauthenticated` lets the site reach the service; the API checks sign-in itself.

## 3. Point the web app at it

Put the service URL (`gcloud run services describe compiler --region asia-south1 --format 'value(status.url)'`) in `apps/web/.env.production.local` as `VITE_COMPILE_URL`, then `pnpm deploy:hosting`.

## Notes

- **Cold starts.** The first compile after a quiet spell starts an instance, which takes several seconds. If that bothers classes, add `--min-instances 1` (one instance is always billed).
- **Rate limits are per instance.** The per-user limit (30 a minute) is counted per instance. Sign-in plus `--max-instances` bound the total.
- **Rolling back.** Run `gcloud run services update-traffic compiler --region asia-south1 --to-revisions <revision>=100`.
