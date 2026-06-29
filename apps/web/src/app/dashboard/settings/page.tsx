import { redirect } from "next/navigation";

/** /settings has no page of its own — land on Twitch. */
export default function SettingsIndex() {
	redirect("/dashboard/settings/twitch");
}
