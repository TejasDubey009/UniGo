import React, { useState } from 'react';
import { ArrowRight, Check, Clock, Coffee, Moon, ThumbsUp, Utensils } from 'lucide-react';
import confetti from 'canvas-confetti';
import { PageHeader, Reveal } from './ui';

const COMING = [
  {
    icon: Moon,
    title: 'Open until 3 AM',
    desc: 'Late-night delivery to Bharathiar, Mother Teresa, Madame Curie and every other PU hostel gate.',
  },
  {
    icon: Clock,
    title: 'About 20 minutes',
    desc: 'From the campus canteen and Kalapet kitchens to your hostel entrance.',
  },
  {
    icon: Utensils,
    title: 'Canteen prices',
    desc: 'The price you would pay at the counter. No packaging markup, no surge fee, no hidden student charges.',
  },
  {
    icon: Coffee,
    title: 'Weekend cafe drops',
    desc: 'Croissants, gelato and sourdough from White Town and Auroville bakeries, brought to campus on weekends.',
  },
];

const DISHES = [
  { id: 'maggi', name: 'Hostel night Maggi with cheese', tag: 'Exam fuel' },
  { id: 'dosa', name: 'PU canteen ghee roast and chutney', tag: 'Campus classic' },
  { id: 'shawarma', name: 'Kalapet chicken roll', tag: 'Midnight bite' },
  { id: 'biryani', name: 'Ambur dum biryani, half bucket', tag: 'Sunday special' },
  { id: 'coffee', name: 'Filter coffee and French baguette', tag: 'White Town' },
];

function DishRow({ dish, votes, maxVotes, voted, onVote }) {
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
            {votes} votes
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onVote}
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
  const [notifyEmail, setNotifyEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [votedItems, setVotedItems] = useState({
    'maggi': 142,
    'dosa': 210,
    'shawarma': 188,
    'biryani': 264,
    'coffee': 175,
  });
  const [myVotes, setMyVotes] = useState({});

  // One vote per dish; clicking again takes the vote back
  const handleVote = (key) => {
    const hasVoted = Boolean(myVotes[key]);
    setMyVotes((prev) => ({ ...prev, [key]: !hasVoted }));
    setVotedItems((prev) => ({
      ...prev,
      [key]: prev[key] + (hasVoted ? -1 : 1),
    }));
  };

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!notifyEmail) return;
    setIsSubscribed(true);
    confetti({
      particleCount: 60,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#9fe870', '#163300', '#ffd300'],
    });
  };

  const maxVotes = Math.max(...Object.values(votedItems));

  const waitlist = (
    <div className="w-full lg:w-[400px]">
      {!isSubscribed ? (
        <form onSubmit={handleSubscribe} className="surface p-5 sm:p-6">
          <label htmlFor="food-notify" className="label">
            Get a message when we launch
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="food-notify"
              type="text"
              required
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="WhatsApp number or email"
              className="field flex-1 min-w-0"
            />
            <button type="submit" className="btn btn-primary shrink-0">
              Notify me
              <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 text-[13px] text-muted">Early sign-ups get a free midnight delivery at launch.</p>
        </form>
      ) : (
        <div role="status" className="surface p-5 sm:p-6 flex items-start gap-4 animate-pop-in">
          <span className="w-10 h-10 rounded-full bg-lime text-forest flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" strokeWidth={3} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-ink">You are on the list</p>
            <p className="mt-1 text-[14px] text-body leading-relaxed break-words">
              We will message {notifyEmail} on launch day with your free midnight delivery coupon.
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
        title="Midnight food, to your hostel"
        description="Ghee roast from the canteen at 11 PM, Maggi during exam week. We are signing up campus and Kalapet kitchens now, with doorstep delivery to your hostel and no surge fees."
        aside={waitlist}
      />

      {/* What is coming */}
      <section className="mt-24 sm:mt-32 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        <Reveal className="lg:col-span-4">
          <p className="eyebrow mb-4">What is coming</p>
          <h2 className="heading text-[30px] sm:text-[40px]">Built around hostel hours</h2>
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
                votes={votedItems[dish.id]}
                maxVotes={maxVotes}
                voted={Boolean(myVotes[dish.id])}
                onVote={() => handleVote(dish.id)}
              />
            </Reveal>
          ))}
        </ul>
      </section>
    </div>
  );
}
