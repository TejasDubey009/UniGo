import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Moon, ThumbsUp, Utensils } from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabase';
import { celebrate } from '../lib/celebrate';
import { PageHeader, Reveal } from './ui';

const COMING = [
  {
    icon: Utensils,
    title: 'Campus and Kalapet kitchens',
    desc: 'We are signing up the campus canteens and kitchens in Kalapet first.',
  },
  {
    icon: Moon,
    title: 'To your hostel gate',
    desc: 'Orders come to your hostel entrance, the same way laundry does.',
  },
  {
    icon: ThumbsUp,
    title: 'Menu by vote',
    desc: 'The dishes with the most votes below go on the first menu.',
  },
];

const DISHES = [
  { id: 'maggi', name: 'Hostel night Maggi with cheese', tag: 'Exam fuel' },
  { id: 'dosa', name: 'PU canteen ghee roast and chutney', tag: 'Campus classic' },
  { id: 'shawarma', name: 'Kalapet chicken roll', tag: 'Midnight bite' },
  { id: 'biryani', name: 'Ambur dum biryani, half bucket', tag: 'Sunday special' },
  { id: 'coffee', name: 'Filter coffee and French baguette', tag: 'White Town' },
];

function DishRow({ dish, votes, maxVotes, voted, onVote, saving }) {
  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[16px] sm:text-[17px] font-semibold text-ink">{dish.name}</h3>
          <span className="badge badge-neutral !h-5 !text-[11px]">{dish.tag}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-1.5 flex-1 rounded-full bg-ash overflow-hidden" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-forest transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
              style={{ width: `${Math.round((votes / maxVotes) * 100)}%` }}
            />
          </span>
          <span key={votes} className="w-[72px] text-right text-[13px] text-muted num animate-pop-in">
            {votes} {votes === 1 ? 'vote' : 'votes'}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onVote}
        disabled={saving}
        aria-busy={saving || undefined}
        aria-pressed={voted}
        aria-label={`Vote for ${dish.name}`}
        title={voted ? 'Remove vote' : 'Upvote'}
        className={`btn btn-sm shrink-0 min-w-[92px] ${voted ? 'btn-forest' : 'btn-outline'}`}
      >
        {voted ? (
          <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
        ) : (
          <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        {voted ? 'Voted' : 'Vote'}
      </button>
    </div>
  );
}

export default function FoodView() {
  const { user, requireAuth } = useApp();
  const userId = user?.id;
  // Vote totals are public; which dishes this student voted for, and the launch list, are theirs
  const [voteCounts, setVoteCounts] = useState({});
  const [mine, setMine] = useState({ userId: null, votes: {}, onList: false });
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('dish_vote_counts').then(({ data }) => {
      if (data) setVoteCounts(Object.fromEntries(data.map((row) => [row.dish_id, Number(row.votes)])));
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      supabase.from('dish_votes').select('dish_id'),
      supabase.from('launch_waitlist').select('service').eq('service', 'food'),
    ]).then(([votes, list]) => {
      if (cancelled) return;
      setMine({
        userId,
        votes: Object.fromEntries((votes.data || []).map((row) => [row.dish_id, true])),
        onList: Boolean(list.data?.length),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const myVotes = mine.userId === userId ? mine.votes : {};
  const isSubscribed = mine.userId === userId && mine.onList;

  // One vote per dish; clicking again takes the vote back. Shown at once, undone if saving fails.
  // A dish's button waits for its save, so quick double taps can't leave it showing the wrong state.
  const [savingDish, setSavingDish] = useState(null);
  const handleVote = async (dishId) => {
    if (savingDish) return;
    if (!requireAuth('Sign in with your university account to vote for the first menu.')) return;
    const hasVoted = Boolean(myVotes[dishId]);
    const apply = (voted) => {
      setMine((prev) => ({ ...prev, userId, votes: { ...prev.votes, [dishId]: voted } }));
      setVoteCounts((prev) => ({ ...prev, [dishId]: Math.max(0, (prev[dishId] || 0) + (voted ? 1 : -1)) }));
    };
    apply(!hasVoted);
    setSavingDish(dishId);
    const { error: voteError } = hasVoted
      ? await supabase.from('dish_votes').delete().eq('dish_id', dishId)
      : await supabase.from('dish_votes').insert({ dish_id: dishId });
    setSavingDish(null);
    // A vote that was already saved (23505) is a success, not a failure
    if (voteError && voteError.code !== '23505') apply(hasVoted);
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!requireAuth('Sign in with your university account to hear when UniGo Food launches.')) return;
    setIsJoining(true);
    setError('');
    const { error: joinError } = await supabase.from('launch_waitlist').insert({ service: 'food' });
    setIsJoining(false);
    // Already on the list counts as success
    if (joinError && joinError.code !== '23505') {
      setError("Couldn't add you to the list. Please try again.");
      return;
    }
    setMine((prev) => ({ ...prev, userId, onList: true }));
    celebrate(60);
  };

  const maxVotes = Math.max(1, ...DISHES.map((dish) => voteCounts[dish.id] || 0));

  const waitlist = (
    <div className="w-full lg:w-[400px]">
      {!isSubscribed ? (
        <form onSubmit={handleSubscribe} className="surface p-5 sm:p-6">
          <p className="text-[16px] font-semibold text-ink">Hear first when we launch</p>
          <p className="mt-1 text-[14px] text-body">
            {user ? `We'll email ${user.email} on launch day.` : "We'll email your university address on launch day."}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-[14px] text-alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={isJoining} aria-busy={isJoining} className="btn btn-primary w-full mt-4">
            {isJoining ? 'Adding you…' : 'Notify me'}
            {!isJoining && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
          </button>
        </form>
      ) : (
        <div role="status" className="surface p-5 sm:p-6 flex items-start gap-4 animate-pop-in">
          <span className="w-10 h-10 rounded-full bg-lime text-forest flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" strokeWidth={3} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-ink">You are on the list</p>
            <p className="mt-1 text-[14px] text-body leading-relaxed break-words">
              We will email {user?.email || 'you'} when UniGo Food opens.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="UniGo Food · coming soon"
        title="Late-night food, to your hostel"
        description="We are signing up campus and Kalapet kitchens now. Vote for the dishes you want on the first menu, and join the list to hear when it opens."
        aside={waitlist}
      />

      {/* What is coming */}
      <section className="mt-24 sm:mt-32 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        <Reveal className="lg:col-span-4">
          <p className="eyebrow mb-4">What is coming</p>
          <h2 className="heading text-[30px] sm:text-[40px]">Set up like laundry</h2>
        </Reveal>

        <ul className="lg:col-span-8 border-t border-ink">
          {COMING.map(({ icon: Icon, title, desc }, i) => (
            <Reveal
              as="li"
              key={title}
              delay={i * 60}
              className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)] items-start gap-x-5 sm:gap-x-8 gap-y-1 py-6 sm:py-7 border-b border-hairline"
            >
              <span className="w-10 h-10 rounded-full bg-ash text-forest flex items-center justify-center">
                <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
              </span>
              <h3 className="heading text-[22px] sm:text-[24px] pt-1.5">{title}</h3>
              <p className="col-start-2 sm:col-start-3 text-[15px] text-body leading-relaxed sm:pt-1.5">{desc}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Dish vote */}
      <section className="mt-24 sm:mt-32 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        <Reveal className="lg:col-span-4">
          <p className="eyebrow mb-4">Help us pick</p>
          <h2 className="heading text-[30px] sm:text-[40px]">Vote for the first menu</h2>
          <p className="mt-4 text-[15px] text-body leading-relaxed">
            The most-voted dishes decide which canteen partners we sign first. One vote per dish; tap again to take
            it back.
          </p>
        </Reveal>

        <ul className="lg:col-span-8 border-t border-ink">
          {DISHES.map((dish, i) => (
            <Reveal as="li" key={dish.id} delay={i * 60} className="py-5 border-b border-hairline">
              <DishRow
                dish={dish}
                votes={voteCounts[dish.id] || 0}
                maxVotes={maxVotes}
                voted={Boolean(myVotes[dish.id])}
                onVote={() => handleVote(dish.id)}
                saving={savingDish === dish.id}
              />
            </Reveal>
          ))}
        </ul>
      </section>
    </div>
  );
}
