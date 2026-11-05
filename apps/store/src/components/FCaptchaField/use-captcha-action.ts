"use client";
import { useActionState, useState } from "react";

/**
 * `useActionState` for a form that holds a captcha. It also counts finished
 * submissions, so the widget can be reset after each one: a captcha token
 * works once, even when the action fails.
 *
 * Pass `attempts` to `<FCaptchaField resetSignal={attempts} />`.
 */
export const useCaptchaAction = <Result>(
  action: (previousState: unknown, formData: FormData) => Promise<Result>
) => {
  const [attempts, setAttempts] = useState(0);
  const [state, formAction] = useActionState<Result | null, FormData>(
    async (_previousState, formData) => {
      try {
        return await action(null, formData);
      } finally {
        setAttempts((count) => count + 1);
      }
    },
    null
  );

  return { attempts, formAction, state } as const;
};
