"use client";

import React, { useState } from "react";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
      <div
        className={
          "bg-teal-600 text-white transition-all duration-300 z-10 w-64"
        }
      >
        <div className="flex flex-col ms-2 me-2">
          <div className="mt-4">
            <button
              type="button"
              className="text-white bg-teal-600 hover:bg-teal-500 w-full focus:bg-teal-500 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:focus:ring-[#3b5998]/55 me-2 mb-2"
            >
              <svg 
                className="me-2 fill-white"
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 -960 960 960">
                  <path 
                    d="M520-600v-240h320v240zM120-440v-400h320v400zm400 320v-400h320v400zm-400 0v-240h320v240zm80-400h160v-240H200zm400 320h160v-240H600zm0-480h160v-80H600zM200-200h160v-80H200zm160-80"/>
              </svg>
              Dashboard
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="text-white bg-teal-600 hover:bg-teal-500 focus:bg-teal-500 w-full focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:focus:ring-[#3b5998]/55 me-2 mb-2"
            >
              <svg 
                className="me-2 fill-white"
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 -960 960 960">
                  <path d="M200-200v-560zm0 80q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v100h-80v-100H200v560h560v-100h80v100q0 33-23.5 56.5T760-120zm320-160q-33 0-56.5-23.5T440-360v-240q0-33 23.5-56.5T520-680h280q33 0 56.5 23.5T880-600v240q0 33-23.5 56.5T800-280zm280-80v-240H520v240zm-160-60q25 0 42.5-17.5T700-480t-17.5-42.5T640-540t-42.5 17.5T580-480t17.5 42.5T640-420"/>
              </svg>
              Accounts
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="text-white bg-teal-600 hover:bg-teal-500 focus:bg-teal-500 w-full focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:focus:ring-[#3b5998]/55 me-2 mb-2"
            >
              <svg 
                className="me-2 fill-white"
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 -960 960 960">
                  <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5-2-31.5-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266zm42-180q58 0 99-41t41-99-41-99-99-41q-59 0-99.5 41T342-480t40.5 99 99.5 41m-2-140"/>
              </svg>
              Settings
            </button>
          </div>
        </div>
      </div>
  );
};

export default Sidebar;
