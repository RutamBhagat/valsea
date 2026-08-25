import { Button } from "@valsea/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm() {
  const { isPending } = authClient.useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signInWithGoogle = async () => {
    setIsSigningIn(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
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
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-2 text-center text-3xl font-bold">Sign In</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Use your Google account to continue.
      </p>
      <Button className="w-full" onClick={signInWithGoogle} disabled={isSigningIn}>
        {isSigningIn ? "Redirecting..." : "Continue with Google"}
      </Button>
    </div>
  );
}
