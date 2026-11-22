import type { ComponentProps } from "react";

/** <form> กลาง: ใช้คู่กับ <SubmitButton> (สปินเนอร์ขณะ server action ทำงาน) */
export function AsyncForm(props: ComponentProps<"form">) {
  return <form {...props} />;
}
