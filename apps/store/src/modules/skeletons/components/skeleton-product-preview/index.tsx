const SkeletonProductPreview = () => {
  return (
    <div>
      <div className="sf-skeleton aspect-[3/4] w-full" />
      <div className="mt-4 flex flex-col items-center gap-2">
        <div className="sf-skeleton h-5 w-3/5" />
        <div className="sf-skeleton h-4 w-1/4" />
      </div>
    </div>
  );
};

export default SkeletonProductPreview;
