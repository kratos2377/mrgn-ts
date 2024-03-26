export enum MintPageState {
  DEFAULT = "default",
  ERROR = "error",
  SUCCESS = "success",
}

export interface MintCardProps {
  title: "YBX" | "LST";
  icon: () => JSX.Element;
  description: string;
  price: string;
  features: string[];
  volume: string;
  volumeUsd: string;
  action: () => void;
}

export const signUpYbx = async (
  emailInputRef: React.RefObject<HTMLInputElement>,
  type: "partner" | "notifications"
) => {
  if (!emailInputRef.current) {
    return;
  }

  const formId =
    type === "partner"
      ? process.env.NEXT_PUBLIC_CONVERT_KIT_YBX_PARTNER_FORM_UID
      : process.env.NEXT_PUBLIC_CONVERT_KIT_YBX_NOTIFICATIONS_FORM_UID;

  const res = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_CONVERT_KIT_API_KEY,
      email: emailInputRef.current.value,
    }),
  });

  if (!res.ok) {
    throw new Error("Something went wrong subscribing");
  }

  return;
};
