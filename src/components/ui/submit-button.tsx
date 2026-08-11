"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "loading">;

export function SubmitButton({ children, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} type="submit" loading={pending} disabled={pending || props.disabled}>
      {children}
    </Button>
  );
}
