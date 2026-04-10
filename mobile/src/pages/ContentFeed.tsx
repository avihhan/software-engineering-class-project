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
        <div style={{ display: 'grid', gap: '1rem' }}>
          {posts.map((post) => {
            const comments = commentsByPost[post.id] || [];
            const commentsOpen = activeCommentsPostId === post.id;
            return (
              <section key={post.id} className="section">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>{post.title || 'Update'}</strong>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {new Date(post.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="form-hint" style={{ marginTop: 0 }}>
                  Posted by {post.author_email || 'Tenant Owner'} · {post.type}
                </p>
                {post.body && <p style={{ marginTop: '0.5rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{post.body}</p>}
                {post.media_url && (
                  <p className="form-hint">
                    Media:{' '}
                    <a href={post.media_url} target="_blank" rel="noreferrer">
                      Open resource
                    </a>
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="login-btn"
                    style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                    disabled={busyLikePostId === post.id}
                    onClick={() => void toggleLike(post)}
                  >
                    {post.viewer_has_liked ? 'Unlike' : 'Like'} ({post.like_count})
                  </button>
                  <button
                    type="button"
                    className="login-btn"
                    style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={() => void openComments(post.id)}
                  >
                    Comments ({post.comment_count})
                  </button>
                </div>

                {commentsOpen && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
                    {comments.length === 0 ? (
                      <p className="form-hint">No comments yet.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {comments.map((c) => (
                          <div key={c.id} className="card" style={{ padding: '0.7rem' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>{c.body}</p>
                            <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>
                              {c.user_email || 'Member'} · {new Date(c.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        value={commentDraftByPost[post.id] || ''}
                        onChange={(e) => setCommentDraftByPost((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        placeholder="Write a comment..."
                      />
                      <button
                        type="button"
                        className="login-btn"
                        style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
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
