import { homeMarkup } from "./home-markup";

export default function Home() {
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: homeMarkup }} />;
}
