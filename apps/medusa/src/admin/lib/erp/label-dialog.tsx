import { Button, Drawer, Text } from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { describeError, erp } from "./api";
import { Spinner } from "./spinner";
import { ERP_QUERY_ROOT } from "./use-erp";

/** Object URL for an SVG string, revoked when the SVG changes or unmounts. */
const useSvgUrl = (svg: string | undefined): string | undefined => {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!svg) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml" })
    );
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [svg]);
  return url;
};

const LabelPreview = ({
  path,
  frameRef,
}: {
  path: string;
  frameRef: React.RefObject<HTMLIFrameElement>;
}) => {
  // Modal-only data: fetched when the dialog opens (mounted), never for display.
  const { data, isLoading, error } = useQuery<string, Error>({
    queryKey: [ERP_QUERY_ROOT, "label", path],
    queryFn: () => erp.text(path),
    staleTime: 0,
    retry: false,
  });
  const url = useSvgUrl(data);

  if (isLoading) {
    return <Spinner label="Loading label" />;
  }
  if (error || !url) {
    return (
      <Text className="text-ui-fg-error" role="alert" size="small">
        {error ? describeError(error) : "The label could not be rendered."}
      </Text>
    );
  }
  return (
    <iframe
      className="h-72 w-full rounded-md border border-ui-border-base bg-white"
      ref={frameRef}
      // No scripts run inside the label; same-origin + modals only so we can print it.
      sandbox="allow-same-origin allow-modals"
      src={url}
      title="Label preview"
    />
  );
};

/**
 * Fetches an SVG label through the SDK (it carries the admin session; a plain
 * link would be unauthenticated), shows it in a dialog and prints it.
 */
export const LabelButton = ({
  label,
  title,
  path,
}: {
  label: string;
  title: string;
  path: string;
}) => {
  const [open, setOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const print = () => {
    frameRef.current?.contentWindow?.focus();
    frameRef.current?.contentWindow?.print();
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} size="small" variant="secondary">
        {label}
      </Button>
      <Drawer onOpenChange={setOpen} open={open}>
        <Drawer.Content className="max-w-xl">
          <Drawer.Header>
            <Drawer.Title>{title}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-3 p-4">
            {open ? <LabelPreview frameRef={frameRef} path={path} /> : null}
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button size="small" variant="secondary">
                Close
              </Button>
            </Drawer.Close>
            <Button onClick={print} size="small">
              Print
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </>
  );
};
