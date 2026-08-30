import { type RefObject } from "react";

type GiftContactFieldsProps = {
  nameInputRef: RefObject<HTMLInputElement | null>;
  defaultName?: string;
  defaultEmail?: string;
  defaultMessage?: string;
  labels: {
    name: string;
    email: string;
    message: string;
    optional: string;
  };
};

export default function GiftContactFields({
  nameInputRef,
  defaultName,
  defaultEmail,
  defaultMessage,
  labels,
}: GiftContactFieldsProps) {
  return (
    <>
      <label className="grid gap-1.5">
        <span className="font-medium text-[#514844]">{labels.name}</span>
        <input
          ref={nameInputRef}
          name="name"
          type="text"
          defaultValue={defaultName}
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          className="rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-[#514844]">{labels.email}</span>
        <input
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
          maxLength={254}
          autoComplete="email"
          className="rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="font-medium text-[#514844]">
          {labels.message}{" "}
          <span className="font-normal text-[#958985]">{labels.optional}</span>
        </span>
        <textarea
          name="message"
          defaultValue={defaultMessage}
          rows={3}
          maxLength={1000}
          className="resize-none rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
        />
      </label>
    </>
  );
}
