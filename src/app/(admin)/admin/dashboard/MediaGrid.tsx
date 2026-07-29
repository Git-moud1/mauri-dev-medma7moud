'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { uploadImage } from '../upload/actions';
import { useToast } from '../ui/Toaster';
import { Button, IconButton, EmptyState } from '../ui/primitives';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/images/limits';

/**
 * The media section.
 *
 * Paths are an implementation detail this component exists to hide. The owner
 * drags files in, sees thumbnails, drags them into order, clicks × to remove and
 * ★ to set the cover. The stored value is still a path — that is the data model
 * — but it is produced here and never typed.
 *
 * Reorder works by pointer AND by keyboard. Drag-only reorder locks out anyone
 * not using a mouse, so every thumbnail carries move-back / move-forward
 * buttons that do the same thing.
 */

export interface MediaItem {
  path: string;
  /** Present only for images uploaded in this session; bundled ones have none. */
  blurDataURL?: string;
}

interface Props {
  projectId: string;
  items: MediaItem[];
  cover: string;
  onChange: (items: MediaItem[], cover: string) => void;
}

interface PendingUpload {
  id: number;
  name: string;
  error?: string;
}

export function MediaGrid({ projectId, items, cover, onChange }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const nextPendingId = useRef(0);

  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      onChange(next, cover);
    },
    [items, cover, onChange],
  );

  const remove = useCallback(
    (path: string) => {
      const removed = items.find((item) => item.path === path);
      const index = items.findIndex((item) => item.path === path);
      const next = items.filter((item) => item.path !== path);
      // Removing the cover promotes the next image rather than leaving the
      // project with a cover that is no longer in its own gallery.
      const nextCover = cover === path ? (next[0]?.path ?? '') : cover;
      onChange(next, nextCover);

      // One image is not worth a confirmation dialog — it is worth an undo.
      toast.push({
        tone: 'success',
        text: 'Image removed.',
        action: {
          label: 'Undo',
          run: () => {
            if (!removed) return;
            const restored = [...next];
            restored.splice(index, 0, removed);
            onChange(restored, cover);
          },
        },
      });
    },
    [items, cover, onChange, toast],
  );

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      if (list.length === 0) return;

      const accepted: MediaItem[] = [];

      await Promise.all(
        list.map(async (file) => {
          const id = nextPendingId.current++;
          setPending((current) => [...current, { id, name: file.name }]);

          // The failure stays on screen against the filename that caused it,
          // rather than vanishing into a toast that names no file.
          const fail = (error: string) => {
            setPending((current) =>
              current.map((item) => (item.id === id ? { ...item, error } : item)),
            );
          };

          // Checked here as well as on the server, because over the limit the
          // server never gets to answer: the request dies in the framework or
          // at the CDN and the call below throws instead of returning. Catching
          // that is the fix directly beneath; refusing to send it is the fix
          // that gives an accurate message.
          if (file.size > MAX_UPLOAD_BYTES) {
            fail(
              `${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_LABEL}.`,
            );
            return;
          }

          const formData = new FormData();
          formData.set('projectId', projectId);
          formData.set('file', file);

          let result;
          try {
            result = await uploadImage(formData);
          } catch {
            // A Server Action can reject rather than return: a 413 or 502 from
            // an oversized body, a dropped connection, a cold-start timeout.
            // Without this the rejection escaped through `Promise.all` into the
            // un-awaited `void upload(…)` and the row span "Uploading…" for
            // ever — a silent failure, which is a worse bug than the upload
            // failing.
            fail('Upload failed — the server did not respond. Try again.');
            return;
          }

          if (result.ok) {
            accepted.push({ path: result.path, blurDataURL: result.blurDataURL });
            setPending((current) => current.filter((item) => item.id !== id));
          } else {
            fail(result.error);
          }
        }),
      );

      if (accepted.length > 0) {
        const next = [...items, ...accepted];
        onChange(next, cover || (next[0]?.path ?? ''));
      }
    },
    [projectId, items, cover, onChange],
  );

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => {
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void upload(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
          dragOver ? 'border-gold bg-gold/5' : 'border-border'
        }`}
      >
        <p className="text-sm text-fg">Drop images here</p>
        <p className="mt-1 text-xs text-muted">
          JPEG, PNG, WebP or AVIF · up to {MAX_UPLOAD_LABEL} each
        </p>
        <Button
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={!/^[a-z0-9-]+$/.test(projectId)}
        >
          Choose files
        </Button>
        {!/^[a-z0-9-]+$/.test(projectId) ? (
          <p className="mt-2 text-xs text-muted">Give the project an id first.</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          /**
           * `image/*`, not a list of the four types this accepts.
           *
           * `accept` filters the OS picker by the MIME the *operating system*
           * maps an extension to, and that mapping is full of holes: on the
           * Windows box this was found on, `.jfif` maps to `image/jpeg` but
           * `.webp` and `.avif` map to nothing at all, so a precise list grays
           * out real WebP files while a `.jfif` JPEG was blocked on other
           * machines. The whitelist was never the security boundary anyway —
           * `sniffImageType` reads the leading bytes server-side and the picker
           * cannot be trusted for anything. So let anything image-shaped be
           * chosen and let the sniffer give a straight answer about it.
           */
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {/* In-flight and failed uploads */}
      {pending.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {pending.map((item) => (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs ${
                item.error ? 'border-red-500/40 text-red-400' : 'border-border text-muted'
              }`}
            >
              <span className="flex-1 truncate">{item.name}</span>
              {item.error ? (
                <>
                  <span>{item.error}</span>
                  <IconButton
                    label={`Dismiss error for ${item.name}`}
                    onClick={() => {
                      setPending((current) => current.filter((p) => p.id !== item.id));
                    }}
                  >
                    ×
                  </IconButton>
                </>
              ) : (
                <span className="animate-pulse motion-reduce:animate-none">
                  Uploading…
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Thumbnails */}
      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No images yet"
            description="Drop screenshots above. The first one becomes the cover, and you can change that with the star on any thumbnail."
          />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((item, index) => {
            const isCover = item.path === cover;
            return (
              <li
                key={item.path}
                draggable
                onDragStart={() => {
                  setDragIndex(index);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null) move(dragIndex, index);
                  setDragIndex(null);
                }}
                className={`group relative overflow-hidden rounded-xl border transition-colors duration-150 ${
                  isCover ? 'border-gold' : 'border-border'
                } ${dragIndex === index ? 'opacity-50' : ''}`}
              >
                <div className="relative aspect-[4/3] bg-surface-2">
                  <Image
                    src={item.path}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 20vw"
                    className="object-cover"
                    placeholder={item.blurDataURL ? 'blur' : 'empty'}
                    blurDataURL={item.blurDataURL}
                    unoptimized={item.path.startsWith('/api/media/')}
                  />
                </div>

                {isCover ? (
                  <span className="absolute start-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[0.625rem] font-semibold text-[rgb(12_10_20)]">
                    Cover
                  </span>
                ) : null}

                <div className="flex items-center justify-between gap-1 border-t border-border bg-surface px-1.5 py-1">
                  <div className="flex">
                    <IconButton
                      label={`Move ${index + 1} back`}
                      disabled={index === 0}
                      onClick={() => {
                        move(index, index - 1);
                      }}
                    >
                      ‹
                    </IconButton>
                    <IconButton
                      label={`Move ${index + 1} forward`}
                      disabled={index === items.length - 1}
                      onClick={() => {
                        move(index, index + 1);
                      }}
                    >
                      ›
                    </IconButton>
                  </div>
                  <div className="flex">
                    <IconButton
                      label={
                        isCover
                          ? `Image ${index + 1} is the cover`
                          : `Set image ${index + 1} as cover`
                      }
                      aria-pressed={isCover}
                      onClick={() => {
                        onChange(items, item.path);
                      }}
                      className={isCover ? 'text-gold' : ''}
                    >
                      {isCover ? '★' : '☆'}
                    </IconButton>
                    <IconButton
                      label={`Remove image ${index + 1}`}
                      tone="danger"
                      onClick={() => {
                        remove(item.path);
                      }}
                    >
                      ×
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
