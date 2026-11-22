import type { FormHTMLAttributes } from "react";

/** <form> กลาง: ใช้คู่กับ <SubmitButton> (สปินเนอร์ขณะ server action ทำงาน) */
export function AsyncForm(props: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} />;
}
