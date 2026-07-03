import { z } from "zod";

export const SIGNUP_PASSWORD_MIN = 12;
export const SIGNUP_INVITE_CODE_MIN = 15;

export const signUpSchema = z.object({
  email: z.email({ error: "Podaj prawidłowy adres e-mail." }),
  password: z.string().min(SIGNUP_PASSWORD_MIN, {
    error: `Hasło musi mieć co najmniej ${String(SIGNUP_PASSWORD_MIN)} znaków.`,
  }),
  inviteCode: z.string().min(SIGNUP_INVITE_CODE_MIN, { error: "Kod zaproszenia jest za krótki." }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
