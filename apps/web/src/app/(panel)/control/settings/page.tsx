import { redirect } from "next/navigation";

/** /control/settings has no page of its own — land on Twitch. */
export default function SettingsIndex() {
	redirect("/control/settings/twitch");
}
