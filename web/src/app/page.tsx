"use client";

import type { NextPage } from "next";
import Head from "next/head";
import VideoChat from "./components/videoChat";

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>⚡SyncTalk - Instant Random Video Chats</title>
        <meta
          name="description"
          content="Meet someone new with just one click. Secure, peer-to-peer video chats"
        />
      </Head>

      <VideoChat />
    </>
  );
};

export default Home;
