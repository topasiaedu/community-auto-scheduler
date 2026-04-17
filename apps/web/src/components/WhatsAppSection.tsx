/**
 * WhatsApp linking panel — calm card states using shadcn Card, Alert, Badge, Button.
 * No yellow alert boxes. 2-col QR layout. Inline reset confirmation.
 */

import type { ReactElement } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type WhatsAppSectionProps = {
  vm: NmcasViewModel;
};

export function WhatsAppSection({ vm }: WhatsAppSectionProps): ReactElement | null {
  const {
    canUseApiRoutes,
    waStatusUnavailable,
    showLinkHelp,
    waConnecting,
    waState,
    qrDataUrl,
    groups,
    refreshHealth,
    refreshWa,
    refreshQrFromServer,
    refreshGroups,
    sessionResetting,
    resetSessionConfirming,
    onClickResetSession,
    onConfirmResetSession,
    onDismissResetSession,
    waConnected,
  } = vm;

  if (!canUseApiRoutes) {
    return null;
  }

  if (waStatusUnavailable) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-col gap-3">
          <p>Cannot reach WhatsApp status. Make sure the API server is running.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void refreshHealth()}>Retry health check</Button>
            <Button size="sm" onClick={() => void refreshWa()}>Retry WhatsApp</Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (showLinkHelp) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Link WhatsApp</CardTitle>
            <Badge variant="outline" className={waConnecting ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-muted text-muted-foreground"}>
              {waState?.state === "connecting" ? "Connecting…" : "Not connected"}
            </Badge>
          </div>
          <CardDescription>Scan the QR code with the phone that owns this WhatsApp account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto]">
            {/* Instructions column */}
            <div className="space-y-4">
              <ol className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="flex-shrink-0 font-semibold text-muted-foreground">1.</span>
                  <span>Open WhatsApp on your phone.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 font-semibold text-muted-foreground">2.</span>
                  <span>Go to <strong>Settings → Linked devices</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 font-semibold text-muted-foreground">3.</span>
                  <span>Tap <strong>Link a device</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 font-semibold text-muted-foreground">4.</span>
                  <span>Point your camera at the QR code.</span>
                </li>
              </ol>
              {waConnecting ? (
                <p className="text-xs text-muted-foreground">Status may flicker briefly after scanning — that's normal.</p>
              ) : null}
              <Button onClick={() => void refreshWa()} className="mt-1">
                {waConnecting ? "Checking status…" : "Refresh status"}
              </Button>
              <Separator />
              {!resetSessionConfirming ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  disabled={sessionResetting}
                  onClick={() => void onClickResetSession()}
                >
                  {sessionResetting ? "Clearing…" : "Having trouble? Clear session and start over ↗"}
                </button>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">This deletes the saved session — you must scan a new QR code.</p>
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={() => void onConfirmResetSession()}>
                      Yes, clear session
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void onDismissResetSession()}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* QR column */}
            <div className="flex items-start justify-center md:justify-end">
              {qrDataUrl !== null ? (
                <figure className="flex flex-col items-center gap-2 m-0">
                  <img
                    src={qrDataUrl}
                    alt="WhatsApp link QR code"
                    width={220}
                    height={220}
                    className="rounded-lg border border-border"
                  />
                  <figcaption className="text-xs text-muted-foreground">
                    Scan with WhatsApp → Linked devices
                  </figcaption>
                </figure>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-8 min-h-[220px] min-w-[220px]">
                  <span className="text-sm text-muted-foreground">Generating QR…</span>
                  <Button variant="outline" size="sm" onClick={() => void refreshQrFromServer()}>
                    Refresh QR
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (waConnected) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="font-semibold text-emerald-800">Connected</span>
              <span className="text-sm text-emerald-700">
                {groups.length === 0
                  ? "— load groups to compose sends"
                  : `· ${String(groups.length)} group${groups.length === 1 ? "" : "s"} available`}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => void refreshGroups()}
            >
              {groups.length > 0 ? "Reload groups" : "Load groups"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">Checking WhatsApp status…</p>
      </CardContent>
    </Card>
  );
}
