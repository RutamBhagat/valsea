import { Button } from "@valsea/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { Google } from "@/components/logo/google-logo";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm() {
  const { isPending } = authClient.useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signInWithGoogle = async () => {
    setIsSigningIn(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: new URL("/", window.location.origin).toString(),
    });

    if (error) {
      setIsSigningIn(false);
      toast.error(error.message || error.statusText);
    }
  };

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-[26px] font-bold tracking-tight">Sign in to valsea</h1>
        <p className="text-balance text-[15px] text-muted-foreground">
          Continue with Google to open your transcription workspace.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isSigningIn}
        aria-busy={isSigningIn}
        onClick={signInWithGoogle}
      >
        <Google aria-hidden="true" data-icon="inline-start" />
        {isSigningIn ? "Redirecting…" : "Continue with Google"}
      </Button>
    </div>
  );
}
