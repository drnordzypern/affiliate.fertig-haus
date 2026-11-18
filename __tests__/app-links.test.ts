// @vitest-environment node
import { expect, test } from "vitest";
import { assetLinksFor } from "@/lib/app-links/android";
import { appleAssociationFor } from "@/lib/app-links/apple";

const FP1 = "1C:82:6E:79:EE:CF:C9:05:DD:A3:F7:C8:F0:D6:EB:82:B6:EA:1C:D5:42:E1:D6:CB:F7:3B:E1:A0:58:FB:8B:39";
const FP2 = "55:8C:DB:27:F9:CB:D5:60:3D:65:56:52:BF:50:10:07:73:C9:65:AA:A1:53:9A:33:E1:BC:7B:B8:16:C0:36:83";

test("Android: nothing configured or a malformed fingerprint serves nothing", () => {
  expect(assetLinksFor({})).toBeNull();
  expect(assetLinksFor({ ANDROID_APP_LINKS_CERT_SHA256: "  " })).toBeNull();
  expect(assetLinksFor({ ANDROID_APP_LINKS_CERT_SHA256: "AA:BB" })).toBeNull();
  expect(assetLinksFor({ ANDROID_APP_LINKS_CERT_SHA256: `${FP1},nonsense` })).toBeNull();
});

test("Android: both signing certificates for the Production package, de-duplicated and upper-cased", () => {
  const links = assetLinksFor({ ANDROID_APP_LINKS_CERT_SHA256: `${FP1.toLowerCase()}, ${FP2}, ${FP1}` });
  expect(links).toEqual([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "net.fertighaus.affiliate", sha256_cert_fingerprints: [FP1, FP2] },
    },
  ]);
});

test("Apple: nothing configured or a malformed Team ID serves nothing", () => {
  expect(appleAssociationFor({})).toBeNull();
  expect(appleAssociationFor({ APPLE_APP_LINKS_TEAM_ID: "short" })).toBeNull();
  expect(appleAssociationFor({ APPLE_APP_LINKS_TEAM_ID: "4U95296Z2C!" })).toBeNull();
});

test("Apple: the app id and exactly the four affiliate journeys", () => {
  expect(appleAssociationFor({ APPLE_APP_LINKS_TEAM_ID: "4u95296z2c" })).toEqual({
    applinks: {
      details: [
        {
          appIDs: ["4U95296Z2C.net.fertighaus.affiliate"],
          components: [{ "/": "/r/*" }, { "/": "/apply/*" }, { "/": "/einladung" }, { "/": "/portal*" }],
        },
      ],
    },
  });
});
