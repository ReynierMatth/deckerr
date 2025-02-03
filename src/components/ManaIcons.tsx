import React from 'react';

    export const ManaWhite = ({ size = 20, ...props }: { size?: number }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path d="M12 2v20M2 12h20" />
      </svg>
    );

    export const ManaBlue = ({ size = 20, ...props }: { size?: number }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path d="M12 2v20M2 12h20" />
        <path d="M12 2v20M2 12h20" transform="rotate(45 12 12)" />
      </svg>
    );

    export const ManaBlack = ({ size = 20, ...props }: { size?: number }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path d="M12 2v20M2 12h20" transform="rotate(90 12 12)" />
        <path d="M12 2v20M2 12h20" transform="rotate(135 12 12)" />
      </svg>
    );

    export const ManaRed = ({ size = 20, ...props }: { size?: number }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path d="M12 2v20M2 12h20" transform="rotate(135 12 12)" />
        <path d="M12 2v20M2 12h20" transform="rotate(180 12 12)" />
      </svg>
    );

    export const ManaGreen = ({ size = 20, ...props }: { size?: number }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <path d="M12 2v20M2 12h20" transform="rotate(180 12 12)" />
        <path d="M12 2v20M2 12h20" transform="rotate(225 12 12)" />
      </svg>
    );

    export const ManaColorless = ({ size = 20, ...props }: { size?: number }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
