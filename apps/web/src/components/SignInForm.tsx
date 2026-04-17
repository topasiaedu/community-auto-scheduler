/**
 * Email / password sign-in form — single form, link to create account below.
 * Uses shadcn Card, Input, Button, Label.
 */

import type { ReactElement } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type SignInFormProps = {
  vm: NmcasViewModel;
};

export function SignInForm({ vm }: SignInFormProps): ReactElement {
  const {
    email,
    setEmail,
    password,
    setPassword,
    authMode,
    setAuthMode,
    authSubmitting,
    authFormError,
    onSubmitAuth,
  } = vm;

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">
          {authMode === "signIn" ? "Sign in" : "Create account"}
        </CardTitle>
        <CardDescription>Use your team credentials. Everyone shares the same workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmitAuth} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {authFormError !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{authFormError}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={authSubmitting}>
            {authSubmitting
              ? "Please wait…"
              : authMode === "signIn"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center pb-6">
        <p className="text-sm text-muted-foreground">
          {authMode === "signIn" ? (
            <>
              No account?{" "}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                onClick={() => setAuthMode("signUp")}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                onClick={() => setAuthMode("signIn")}
              >
                Sign in instead
              </button>
            </>
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
