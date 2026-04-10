import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiOwnerCreateFeedPost,
  apiOwnerCreateUploadSignUrl,
  apiOwnerDeleteFeedPost,
  apiOwnerGetFeedPosts,
  type FeedPost,
} from '../lib/api';

type PostType = 'video' | 'article' | 'post' | 'resource';

export default function ContentResources() {
  const { accessToken } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [postType, setPostType] = useState<PostType>('post');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPublished, setIsPublished] = useState(true);

  function fetchPosts() {
    if (!accessToken) return;
    setLoading(true);
    apiOwnerGetFeedPosts(accessToken)
      .then((rows) => setPosts(rows))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load posts'))
      .finally(() => setLoading(false));
  }

  useEffect(fetchPosts, [accessToken]);

  async function uploadMedia(file: File) {
    if (!accessToken) throw new Error('Not authenticated');
    const sign = await apiOwnerCreateUploadSignUrl(accessToken, file.name);
    if (!sign.signed_upload_url) {
      throw new Error('Signed upload URL was not returned');
    }

    let uploadUrl = sign.signed_upload_url;
    if (sign.token && !uploadUrl.includes('token=')) {
      uploadUrl += `${uploadUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(sign.token)}`;
    }

    const putResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!putResp.ok) {
      const fallbackResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: file,
      });
      if (!fallbackResp.ok) {
        throw new Error('Media upload failed');
      }
    }

    return {
      media_url: sign.public_url,
      media_path: sign.object_path,
      media_mime: file.type || null,
    };
  }

  async function handleCreatePost(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const trimmedMediaUrl = mediaUrl.trim();
    if (!trimmedTitle && !trimmedBody && !trimmedMediaUrl && !selectedFile) {
      setError('Add title, body, media URL, or file before posting.');
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');
    try {
      let mediaPayload: {
        media_url?: string | null;
        media_path?: string | null;
        media_mime?: string | null;
      } = {
        media_url: trimmedMediaUrl || null,
      };
      if (selectedFile) {
        mediaPayload = await uploadMedia(selectedFile);
      }

      const created = await apiOwnerCreateFeedPost(accessToken, {
        type: postType,
        title: trimmedTitle || null,
        body: trimmedBody || null,
        media_url: mediaPayload.media_url ?? null,
        media_path: mediaPayload.media_path ?? null,
        media_mime: mediaPayload.media_mime ?? null,
        is_published: isPublished,
      });

      setPosts((prev) => [created, ...prev]);
      setTitle('');
      setBody('');
      setMediaUrl('');
      setSelectedFile(null);
      setIsPublished(true);
      setStatus('Post published successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create post');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(postId: number) {
    if (!accessToken) return;
    try {
      await apiOwnerDeleteFeedPost(accessToken, postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete post');
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Content, Education & Resources</h1>
        <p className="dashboard-subtitle">
          Create feed posts for your members (Facebook-style timeline).
        </p>
      </header>

      <section className="dashboard-section" style={{ marginBottom: '1rem' }}>
        <h2>Create Post</h2>
        {error && <div className="login-error">{error}</div>}
        {status && <p className="save-badge">{status}</p>}
        <form onSubmit={handleCreatePost} className="settings-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="content-type">Post Type</label>
              <select
                id="content-type"
                value={postType}
                onChange={(e) => setPostType(e.target.value as PostType)}
                disabled={saving}
              >
                <option value="post">Post</option>
                <option value="article">Article</option>
                <option value="video">Video</option>
                <option value="resource">Resource</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="content-title">Title</label>
              <input
                id="content-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                placeholder="e.g. Week 1 Mobility Routine"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="content-body">Body</label>
            <textarea
              id="content-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={saving}
              placeholder="Share educational tips, updates, or instructions..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="content-media-url">Media URL (optional)</label>
              <input
                id="content-media-url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                disabled={saving || Boolean(selectedFile)}
                placeholder="https://..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="content-file">Upload Media (optional)</label>
              <input
                id="content-file"
                type="file"
                disabled={saving || Boolean(mediaUrl.trim())}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <label className="settings-row" style={{ borderBottom: 'none', padding: 0 }}>
            <span className="settings-label">Publish now</span>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              disabled={saving}
            />
          </label>

          <button type="submit" className="login-btn" disabled={saving}>
            {saving ? 'Publishing…' : 'Publish Post'}
          </button>
        </form>
      </section>

      <section className="dashboard-section">
        <h2>Published Feed Posts</h2>
        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : posts.length === 0 ? (
          <div className="empty-state"><p>No posts yet.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Status</th>
                <th>Engagement</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.type}</td>
                  <td>
                    <div>{post.title || 'Untitled'}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(post.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td>{post.is_published ? 'Published' : 'Draft'}</td>
                  <td>{post.like_count} likes · {post.comment_count} comments</td>
                  <td>
                    <button className="delete-btn" onClick={() => void handleDelete(post.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
