import Image from "next/image";
import Sidebar from "./navigation/sidebar";
import AccountTile from "./mainpage/accountTile";
import MainPageHeader from "./mainpage/mainPageHeader";

export default function Home() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="m-4">
          <MainPageHeader />
      </div>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
      </footer>
    </div>
  );
}
