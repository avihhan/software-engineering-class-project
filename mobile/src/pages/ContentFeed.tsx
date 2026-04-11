import { useEffect, useState } from 'react';
import {
  apiCreateFeedComment,
  apiGetFeedComments,
  apiGetFeedPosts,
  apiLikeFeedPost,
  apiUnlikeFeedPost,
  type FeedComment,
  type FeedPost,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';

function isVideoPost(post: FeedPost): boolean {
  const mime = (post.media_mime || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const url = (post.media_url || '').toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi)(\?|$)/.test(url) || post.type === 'video';
}

export default function ContentFeed() {
  const { accessToken } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentsByPost, setCommentsByPost] = useState<Record<number, FeedComment[]>>({});
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  const [commentDraftByPost, setCommentDraftByPost] = useState<Record<number, string>>({});
  const [busyLikePostId, setBusyLikePostId] = useState<number | null>(null);
  const [busyCommentPostId, setBusyCommentPostId] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    apiGetFeedPosts(accessToken)
      .then((rows) => setPosts(rows))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load content'))
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function toggleLike(post: FeedPost) {
    if (!accessToken || busyLikePostId === post.id) return;
    setBusyLikePostId(post.id);
    const previouslyLiked = post.viewer_has_liked;

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              viewer_has_liked: !previouslyLiked,
              like_count: Math.max(0, p.like_count + (previouslyLiked ? -1 : 1)),
            }
          : p,
      ),
    );

    try {
      if (previouslyLiked) {
        await apiUnlikeFeedPost(accessToken, post.id);
      } else {
        await apiLikeFeedPost(accessToken, post.id);
      }
    } catch (err) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                viewer_has_liked: previouslyLiked,
                like_count: Math.max(0, p.like_count + (previouslyLiked ? 0 : -1) + (previouslyLiked ? 1 : 0)),
              }
            : p,
        ),
      );
      setError(err instanceof Error ? err.message : 'Unable to update like');
    } finally {
      setBusyLikePostId(null);
    }
  }

  async function openComments(postId: number) {
    if (!accessToken) return;
    setActiveCommentsPostId(postId);
    if (commentsByPost[postId]) return;
    try {
      const comments = await apiGetFeedComments(accessToken, postId);
      setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load comments');
    }
  }

  async function submitComment(postId: number) {
    if (!accessToken || busyCommentPostId === postId) return;
    const text = (commentDraftByPost[postId] || '').trim();
    if (!text) return;

    setBusyCommentPostId(postId);
    try {
      const comment = await apiCreateFeedComment(accessToken, postId, text);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), comment],
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comment_count: p.comment_count + 1 }
            : p,
        ),
      );
      setCommentDraftByPost((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add comment');
    } finally {
      setBusyCommentPostId(null);
    }
  }

  function renderMedia(post: FeedPost) {
    if (!post.media_url) return null;
    if (isVideoPost(post)) {
      return (
        <div className="feed-post-media-wrap">
          <video className="feed-post-media" controls preload="metadata">
            <source src={post.media_url} type={post.media_mime || undefined} />
            Your browser does not support video playback.
          </video>
        </div>
      );
    }
    return (
      <div className="feed-post-media-wrap">
        <img className="feed-post-media" src={post.media_url} alt={post.title || 'Feed media'} loading="lazy" />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Content & Resources</h1>
        <p className="page-subtitle">Education updates from your trainer and gym owner.</p>
      </header>

      {error && (
        <section className="section" style={{ marginBottom: '1rem' }}>
          <p className="empty-text" style={{ color: '#fca5a5' }}>{error}</p>
        </section>
      )}

      {loading ? (
        <p className="empty-text">Loading feed…</p>
      ) : posts.length === 0 ? (
        <section className="section">
          <p className="empty-text">No content posted yet.</p>
        </section>
      ) : (
        <div className="feed-list">
          {posts.map((post) => {
            const comments = commentsByPost[post.id] || [];
            const commentsOpen = activeCommentsPostId === post.id;
            return (
              <section key={post.id} className="feed-post">
                <div className="feed-post-header">
                  <div className="feed-post-author">
                    <div className="feed-post-avatar">
                      {(post.author_email || 'T').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong>{post.author_email || 'Tenant Owner'}</strong>
                      <p className="feed-post-meta">
                        {new Date(post.created_at).toLocaleString()} · {post.type}
                      </p>
                    </div>
                  </div>
                  <span className="feed-post-chip">{post.type}</span>
                </div>

                {post.title && <h3 className="feed-post-title">{post.title}</h3>}
                {post.body && <p className="feed-post-body">{post.body}</p>}
                {renderMedia(post)}

                <div className="feed-post-stats">
                  <span>{post.like_count} likes</span>
                  <span>{post.comment_count} comments</span>
                </div>

                <div className="feed-post-actions">
                  <button
                    type="button"
                    className="feed-action-btn"
                    disabled={busyLikePostId === post.id}
                    onClick={() => void toggleLike(post)}
                  >
                    {post.viewer_has_liked ? 'Unlike' : 'Like'}
                  </button>
                  <button
                    type="button"
                    className="feed-action-btn"
                    onClick={() => void openComments(post.id)}
                  >
                    Comments
                  </button>
                </div>

                {commentsOpen && (
                  <div className="feed-comments-panel">
                    {comments.length === 0 ? (
                      <p className="form-hint">No comments yet.</p>
                    ) : (
                      <div className="feed-comments-list">
                        {comments.map((c) => (
                          <div key={c.id} className="feed-comment-item">
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>{c.body}</p>
                            <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>
                              {c.user_email || 'Member'} · {new Date(c.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="feed-comment-compose">
                      <input
                        value={commentDraftByPost[post.id] || ''}
                        onChange={(e) => setCommentDraftByPost((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        placeholder="Write a comment..."
                      />
                      <button
                        type="button"
                        className="feed-action-btn"
                        disabled={busyCommentPostId === post.id}
                        onClick={() => void submitComment(post.id)}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
