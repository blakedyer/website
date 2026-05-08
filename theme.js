(() => {
  const site = window.EARTH_HISTORY || { publications: [], albums: [] };
  const galleryStore = window.EARTH_HISTORY_GALLERIES || { albums: [], galleries: {} };
  const rawAlbums = galleryStore.albums && galleryStore.albums.length ? galleryStore.albums : site.albums || [];
  const galleries = galleryStore.galleries || {};
  const albumContext = {
    hawaii: {
      location: "Ka'ena Point and Oahu shorelines",
      context: "Fossil reef terraces, modern reef analogs, and last interglacial sea-level markers"
    },
    "turks-and-caicos": {
      location: "Middle Caicos and nearby carbonate coastlines",
      context: "Reef, dune, beachrock, and elevated shoreline observations"
    },
    "western-us-devonian": {
      location: "Great Basin and western U.S. carbonate sections",
      context: "Devonian platform strata, measured sections, and facies architecture"
    },
    "western-us-pennsylvanian": {
      location: "Western U.S. Pennsylvanian basins",
      context: "Cyclothems, carbonate platforms, and sea-level-sensitive stratigraphy"
    },
    "western-us-cambrian": {
      location: "Western U.S. Cambrian field sites",
      context: "Shallow marine strata and early Paleozoic carbonate archives"
    },
    "canadian-rockies": {
      location: "Southern Canadian Cordillera",
      context: "Paleozoic measured sections, mountain field camps, and isotope records"
    },
    barbados: {
      location: "Cave Hill and Barbadian reef terraces",
      context: "Coral-reef terraces used to reconstruct interglacial sea level"
    },
    bahamas: {
      location: "Bahamian carbonate platforms",
      context: "Coastal stratigraphy, fossil corals, and last interglacial sea-level gradients"
    },
    "south-australia": {
      location: "Flinders Ranges, South Australia",
      context: "Snowball Earth, cap carbonates, and Ediacaran stratigraphy"
    },
    indonesia: {
      location: "Indonesia",
      context: "Travel field photos and landscape observations"
    }
  };

  const slugify = (value = "") =>
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const albums = rawAlbums.map((album) => {
    const key = album.slug || slugify(album.title);
    return { ...albumContext[key], ...album, slug: key };
  });

  const displaySourceForPhoto = (photo = {}) => photo.display || photo.src || photo.thumb || "";

  const galleryLeadPhoto = (gallery, assetSource = "") => {
    if (!gallery || !Array.isArray(gallery.photos) || !gallery.photos.length) {
      return null;
    }

    return (
      gallery.photos.find(
        (photo) =>
          photo.thumb === assetSource ||
          photo.display === assetSource ||
          photo.src === assetSource
      ) || gallery.photos[0]
    );
  };

  const titleCase = (value) =>
    value
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const escapeHtml = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const themeLabel = (tag) => {
    const labels = {
      "sea-level": "Sea level",
      "carbon-cycle": "Carbon cycle",
      stratigraphy: "Stratigraphy",
      methods: "Methods",
      "ice-sheets": "Ice sheets"
    };
    return labels[tag] || titleCase(tag);
  };

  const publicationId = (publication) => `publication-${publication.year}-${slugify(publication.title)}`;

  const firstAuthorLabel = (authors = "") => {
    const firstAuthor = String(authors).split(",")[0].trim();
    return firstAuthor || "Author";
  };

  const shortPublicationLabel = (publication) =>
    `${firstAuthorLabel(publication.authors)} et al ${publication.year}`;

  const CARD_IMAGE_SIZES = [
    "(max-width: 640px) calc(100vw - 2rem)",
    "(max-width: 820px) calc((100vw - 3.15rem) / 2)",
    "(max-width: 1100px) calc((100vw - 4.3rem) / 3)",
    "(max-width: 1240px) calc((100vw - 5.45rem) / 4)",
    "300px"
  ].join(", ");
  const ALBUM_IMAGE_SIZES = [
    "(max-width: 640px) calc(100vw - 2rem)",
    "(max-width: 860px) calc((100vw - 3.15rem) / 2)",
    "(max-width: 1180px) calc((100vw - 4.3rem) / 3)",
    "290px"
  ].join(", ");

  const uniqueImageCandidates = (...sources) =>
    sources.filter(Boolean).filter((source, index, list) => list.indexOf(source) === index);

  const thumbnailPathFor = (source = "") => {
    const replacements = [
      [/\/display\//, "/thumb/"],
      [/\/med\//, "/thumb/"],
      [/\/med_([^/]+)\//, "/thumb_$1/"]
    ];

    for (const [pattern, replacement] of replacements) {
      const candidate = source.replace(pattern, replacement);
      if (candidate !== source) {
        return candidate;
      }
    }

    return "";
  };

  const estimatedImageWidth = (source, index) => {
    if (/^albums\/.+\/thumb\//.test(source)) {
      return 576;
    }

    if (source.includes("/thumb/") || source.includes("thumb_")) {
      return 220;
    }

    if (source.includes("/med/") || source.includes("med_")) {
      return 1200;
    }

    if (/^albums\/.+\/display\//.test(source)) {
      return 1600;
    }

    if (source.includes("/display/") || source.includes("/large/") || source.includes("large_")) {
      return 1200;
    }

    if (/^https?:\/\/earth-history-uvic\.s3\.[^/]+\/web\//.test(source)) {
      return 1600;
    }

    return [320, 960, 1600][Math.min(index, 2)];
  };

  const imageVariantsFor = (...sources) =>
    uniqueImageCandidates(...sources)
      .map((source, index) => ({
        source,
        width: estimatedImageWidth(source, index)
      }))
      .sort((left, right) => left.width - right.width);

  const responsiveSourceSet = (variants, escaper = (value) => value) =>
    variants.map(({ source, width }) => `${escaper(source)} ${width}w`).join(", ");

  const bestImageSource = (variants) => variants[variants.length - 1]?.source || "";

  const publicationMonth = (publication, indexInYear, publicationsInYear) => {
    const month = Number(publication.month);
    if (month >= 1 && month <= 12) {
      return month;
    }

    if (publicationsInYear <= 1) {
      return 7;
    }

    return Math.round(1 + ((publicationsInYear - 1 - indexInYear) * 11) / (publicationsInYear - 1));
  };

  let publicationHighlightTimer;

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const focusWithoutScroll = (target) => {
    try {
      target.focus({ preventScroll: true });
    } catch (error) {
      target.focus();
    }
  };

  const scrollToPublicationTarget = (targetId) => {
    const target = document.getElementById(targetId);
    if (!target || target.hidden) {
      return false;
    }

    document
      .querySelectorAll(".publication-entry.is-targeted")
      .forEach((entry) => entry.classList.remove("is-targeted"));

    target.classList.remove("is-targeted");
    target.offsetWidth;
    target.classList.add("is-targeted");
    window.clearTimeout(publicationHighlightTimer);
    publicationHighlightTimer = window.setTimeout(() => {
      target.classList.remove("is-targeted");
    }, 2600);

    focusWithoutScroll(target);
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center"
    });
    return true;
  };

  function setupNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const menu = document.querySelector("[data-nav-menu]");

    if (!toggle || !menu) {
      return;
    }

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      menu.classList.toggle("is-open", !expanded);
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        toggle.setAttribute("aria-expanded", "false");
        menu.classList.remove("is-open");
      });
    });
  }

  function publicationMarkup(publication, compact = false) {
    const id = publicationId(publication);
    const tags = publication.tags
      .map((tag) => `<li class="tag">${escapeHtml(themeLabel(tag))}</li>`)
      .join("");
    const detailMarkup = compact
      ? `<p class="paper-journal">${escapeHtml(publication.journal)}</p>`
      : `
        <ul class="tag-list">${tags}</ul>
        <p class="paper-summary">${escapeHtml(publication.summary)}</p>
        <p class="paper-authors">${escapeHtml(publication.authors)}</p>
        <p class="paper-journal">${escapeHtml(publication.journal)}</p>
      `;

    return `
      <article id="${escapeHtml(id)}" class="paper-card publication-entry${compact ? " paper-card--compact publication-entry--compact" : ""}" data-tags="${escapeHtml(publication.tags.join(" "))}" data-publication-id="${escapeHtml(id)}" tabindex="-1" aria-labelledby="${escapeHtml(id)}-title">
        <div class="paper-card__top">
          <p class="paper-year">${escapeHtml(publication.year)}</p>
          <a class="paper-link" href="${escapeHtml(publication.link)}" target="_blank" rel="noopener">PDF</a>
        </div>
        <h3 class="paper-title" id="${escapeHtml(id)}-title">
          <a href="${escapeHtml(publication.link)}" target="_blank" rel="noopener">${escapeHtml(publication.title)}</a>
        </h3>
        ${detailMarkup}
      </article>
    `;
  }

  function publicationTimelineMarkup(publications, compact = false) {
    const groups = publications.reduce((items, publication) => {
      const year = String(publication.year);
      if (!items[year]) {
        items[year] = [];
      }
      items[year].push(publication);
      return items;
    }, {});

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(
        (year) => `
          <section class="publication-year-group" data-year="${escapeHtml(year)}">
            <div class="publication-year-marker">
              <span>${escapeHtml(year)}</span>
            </div>
            <div class="publication-year-items">
              ${groups[year].map((publication) => publicationMarkup(publication, compact)).join("")}
            </div>
          </section>
        `
      )
      .join("");
  }

  function publicationOverviewMarkup(publications, options = {}) {
    const linkBase = options.linkBase || "";
    const byYear = publications.reduce((groups, publication) => {
      const year = String(publication.year);
      groups[year] = groups[year] || [];
      groups[year].push(publication);
      return groups;
    }, {});

    const sortedPublications = Object.keys(byYear)
      .sort((a, b) => Number(a) - Number(b))
      .flatMap((year) =>
        byYear[year].map((publication, index) => ({
          publication,
          month: publicationMonth(publication, index, byYear[year].length),
          yearIndex: index,
          yearCount: byYear[year].length
        }))
      )
      .sort(
        (a, b) =>
          Number(a.publication.year) - Number(b.publication.year) ||
          a.month - b.month ||
          a.yearIndex - b.yearIndex
      );

    if (!sortedPublications.length) {
      return "";
    }

    const minPosition = Math.min(
      ...sortedPublications.map(
        ({ publication, month }) => Number(publication.year) + (month - 1) / 12
      )
    );
    const maxPosition = Math.max(
      ...sortedPublications.map(
        ({ publication, month }) => Number(publication.year) + (month - 1) / 12
      )
    );
    const positionRange = Math.max(maxPosition - minPosition, 1);

    return `
      <div class="publication-overview__frame">
        <ol class="publication-overview__track" style="--publication-count: ${sortedPublications.length}">
          ${sortedPublications
            .map(({ publication, month }, index) => {
              const id = publicationId(publication);
              const detailId = `${id}-pin-detail`;
              const position =
                ((Number(publication.year) + (month - 1) / 12 - minPosition) / positionRange) * 100;
              const lane = index % 8;
              const positionClass =
                lane < 4
                  ? "publication-overview__event--above"
                  : "publication-overview__event--below";
              const edgeClass =
                position < 34
                  ? " publication-overview__event--edge-start"
                  : position > 66
                    ? " publication-overview__event--edge-end"
                    : "";
              const label = shortPublicationLabel(publication);
              const pinAttributes = linkBase
                ? `href="${escapeHtml(`${linkBase}${id}`)}"`
                : `type="button"`;

              return `
                <li class="publication-overview__event ${positionClass}${edgeClass}" style="--timeline-position: ${position.toFixed(4)}%; --timeline-lane: ${lane % 4};" data-tags="${escapeHtml(publication.tags.join(" "))}" data-publication-id="${escapeHtml(id)}">
                  <${linkBase ? "a" : "button"}
                    class="publication-overview__pin"
                    ${pinAttributes}
                    data-publication-target="${escapeHtml(id)}"
                    aria-describedby="${escapeHtml(detailId)}"
                    aria-label="Jump to ${escapeHtml(label)}: ${escapeHtml(publication.title)}"
                  >
                    <span class="publication-overview__stem" aria-hidden="true"></span>
                    <span class="publication-overview__dot" aria-hidden="true"></span>
                    <span class="publication-overview__label" aria-hidden="true">${escapeHtml(label)}</span>
                    <span class="publication-overview__detail" id="${escapeHtml(detailId)}" role="tooltip">
                      <span class="publication-overview__detail-year">${escapeHtml(publication.year)}</span>
                      <span class="publication-overview__detail-title">${escapeHtml(publication.title)}</span>
                      <span class="publication-overview__detail-authors">${escapeHtml(publication.authors)}</span>
                    </span>
                  </${linkBase ? "a" : "button"}>
                </li>
              `;
            })
            .join("")}
        </ol>
      </div>
    `;
  }

  function albumMarkup(album) {
    const meta = album.meta || `${album.count} photos`;
    const contextItems = [album.location, album.dateRange, album.context].filter(Boolean);
    const summaryMarkup =
      album.summary && !contextItems.length ? `<p>${escapeHtml(album.summary)}</p>` : "";
    const albumGallery = galleries[album.slug];
    const leadPhoto = galleryLeadPhoto(albumGallery, album.image);
    const imageVariants = imageVariantsFor(
      thumbnailPathFor(album.image),
      leadPhoto?.thumb,
      album.image,
      displaySourceForPhoto(leadPhoto)
    );
    const sourceSet =
      imageVariants.length > 1
        ? ` srcset="${responsiveSourceSet(imageVariants, escapeHtml)}" sizes="${ALBUM_IMAGE_SIZES}"`
        : "";
    const imageSource = bestImageSource(imageVariants) || album.image;

    return `
      <article class="album-card expedition-card">
        <a class="album-card__image" href="${escapeHtml(album.link)}">
          <img src="${escapeHtml(imageSource)}"${sourceSet} alt="${escapeHtml(album.title)} album preview" loading="lazy" decoding="async">
        </a>
        <div class="album-card__body">
          <p class="album-card__meta">${escapeHtml(meta)}</p>
          <h3><a href="${escapeHtml(album.link)}">${escapeHtml(album.title)}</a></h3>
          ${
            contextItems.length
              ? `<ul class="album-card__context">${contextItems
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          ${summaryMarkup}
          <a class="text-link" href="${escapeHtml(album.link)}">Open album</a>
        </div>
      </article>
    `;
  }

  function renderHome() {
    const recentContainer = document.querySelector("#recent-publications");
    const featuredAlbumsContainer = document.querySelector("#featured-albums");

    if (recentContainer) {
      recentContainer.innerHTML = publicationOverviewMarkup(site.publications, {
        linkBase: "publications.html#"
      });
    }

    if (featuredAlbumsContainer) {
      featuredAlbumsContainer.innerHTML = albums
        .filter((album) => album.featured)
        .slice(0, 3)
        .map((album) => albumMarkup(album))
        .join("");
    }
  }

  function renderPublications() {
    const container = document.querySelector("#publication-grid");
    const overview = document.querySelector("[data-publication-overview]");
    if (!container) {
      return;
    }

    container.innerHTML = publicationTimelineMarkup(site.publications);

    if (overview) {
      overview.innerHTML = publicationOverviewMarkup(site.publications);
    }
  }

  function setupPublicationOverview() {
    const overview = document.querySelector("[data-publication-overview]");
    const buttons = Array.from(document.querySelectorAll("[data-publication-target]"));

    if (!overview || !buttons.length) {
      return;
    }

    const clearActivePins = () => {
      overview
        .querySelectorAll(".publication-overview__event.is-active")
        .forEach((event) => event.classList.remove("is-active"));
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        clearActivePins();
        button.closest(".publication-overview__event")?.classList.add("is-active");
        scrollToPublicationTarget(button.dataset.publicationTarget);
      });
    });

    document.addEventListener("click", (event) => {
      if (!overview.contains(event.target)) {
        clearActivePins();
      }
    });
  }

  function setupPublicationFilters() {
    const buttons = Array.from(document.querySelectorAll("[data-filter]"));
    const cards = Array.from(document.querySelectorAll(".paper-card"));
    const groups = Array.from(document.querySelectorAll(".publication-year-group"));
    const overview = document.querySelector("[data-publication-overview]");
    const overviewEvents = Array.from(document.querySelectorAll(".publication-overview__event"));
    const count = document.querySelector("[data-filter-count]");
    const empty = document.querySelector("[data-publication-empty]");

    if (!buttons.length || !cards.length) {
      return;
    }

    const applyFilter = (filter) => {
      let visibleCount = 0;

      buttons.forEach((item) => {
        const active = item.dataset.filter === filter;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });

      cards.forEach((card) => {
        const tags = card.dataset.tags.split(" ");
        const show = filter === "all" || tags.includes(filter);
        card.hidden = !show;
        if (show) {
          visibleCount += 1;
        }
      });

      overviewEvents.forEach((event) => {
        const tags = event.dataset.tags.split(" ");
        const show = filter === "all" || tags.includes(filter);
        event.hidden = !show;
        if (!show) {
          event.classList.remove("is-active");
        }
      });

      groups.forEach((group) => {
        const groupCards = Array.from(group.querySelectorAll(".paper-card"));
        group.hidden = groupCards.every((card) => card.hidden);
      });

      if (overview) {
        overview.hidden = visibleCount === 0;
        overview
          .querySelector(".publication-overview__track")
          ?.style.setProperty("--visible-publication-count", visibleCount);
      }

      if (count) {
        const label = filter === "all" ? "papers" : `${themeLabel(filter)} papers`;
        count.textContent = `${visibleCount} ${label}`;
      }

      if (empty) {
        empty.hidden = visibleCount !== 0;
      }
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        applyFilter(button.dataset.filter);
      });
    });

    const initialFilter = window.location.hash ? window.location.hash.replace("#", "") : "all";
    const validFilter = buttons.some((button) => button.dataset.filter === initialFilter) ? initialFilter : "all";
    applyFilter(validFilter);

    if (initialFilter.startsWith("publication-")) {
      window.setTimeout(() => {
        scrollToPublicationTarget(initialFilter);
      }, 80);
    }

    window.addEventListener("hashchange", () => {
      const targetId = window.location.hash.replace("#", "");
      if (targetId.startsWith("publication-")) {
        scrollToPublicationTarget(targetId);
      }
    });
  }

  function renderAlbums() {
    const container = document.querySelector("#album-grid");
    if (!container) {
      return;
    }

    container.innerHTML = albums.map((album) => albumMarkup(album)).join("");
  }

  function renderCounts() {
    document.querySelectorAll("[data-publication-count]").forEach((item) => {
      item.textContent = String(site.publications.length);
    });

    document.querySelectorAll("[data-album-count]").forEach((item) => {
      item.textContent = String(albums.length);
    });
  }

  function buildGalleryCard(photo, index) {
    const card = document.createElement("article");
    card.className = "gallery-card";

    const button = document.createElement("button");
    button.className = "gallery-card__button";
    button.type = "button";
    button.dataset.index = String(index);

    const image = document.createElement("img");
    image.className = "gallery-card__image";
    const imageVariants = imageVariantsFor(photo.thumb, displaySourceForPhoto(photo));
    image.src = bestImageSource(imageVariants) || displaySourceForPhoto(photo);
    if (imageVariants.length > 1) {
      image.srcset = responsiveSourceSet(imageVariants);
      image.sizes = CARD_IMAGE_SIZES;
    }
    image.alt = photo.alt || photo.caption || `Field photograph ${index + 1}`;
    image.loading = "lazy";
    image.decoding = "async";

    const body = document.createElement("div");
    body.className = "gallery-card__body";

    const caption = document.createElement("p");
    caption.className = "gallery-card__caption";
    caption.textContent = photo.caption || "\u00a0";
    if (!photo.caption) {
      caption.classList.add("is-empty");
      caption.setAttribute("aria-hidden", "true");
    }

    const meta = document.createElement("p");
    meta.className = "gallery-card__meta";
    meta.textContent = photo.caption ? `Photo ${index + 1}` : `Photo ${index + 1}`;

    body.append(caption, meta);
    button.append(image, body);
    card.append(button);
    return card;
  }

  function setupGalleryLightbox(gallery) {
    const lightbox = document.querySelector("#gallery-lightbox");
    if (!lightbox || !gallery.photos.length) {
      return;
    }

    const frame = lightbox.querySelector(".lightbox__frame");
    const image = lightbox.querySelector("[data-lightbox-image]");
    const caption = lightbox.querySelector("[data-lightbox-caption]");
    const meta = lightbox.querySelector("[data-lightbox-meta]");
    const closeButton = lightbox.querySelector("[data-lightbox-close]");
    const prevButton = lightbox.querySelector("[data-lightbox-prev]");
    const nextButton = lightbox.querySelector("[data-lightbox-next]");
    const openButton = document.querySelector("[data-open-gallery]");
    const triggers = Array.from(document.querySelectorAll(".gallery-card__button"));
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "img[tabindex]",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    let currentIndex = 0;
    let previousFocus = null;

    const updatePhoto = (index) => {
      const total = gallery.photos.length;
      currentIndex = (index + total) % total;
      const photo = gallery.photos[currentIndex];

      image.src = photo.src || photo.display || photo.thumb;
      image.alt = photo.alt || photo.caption || `${gallery.title} field photograph ${currentIndex + 1}`;
      caption.textContent = photo.caption || "";
      meta.textContent = `${currentIndex + 1} / ${total}${photo.author ? ` \u00b7 ${photo.author}` : ""}`;
      caption.hidden = !photo.caption;
    };

    const openLightbox = (index) => {
      previousFocus = document.activeElement;
      updatePhoto(index);
      lightbox.hidden = false;
      document.body.classList.add("lightbox-open");
      if (closeButton) {
        closeButton.focus();
      }
    };

    const closeLightbox = () => {
      lightbox.hidden = true;
      document.body.classList.remove("lightbox-open");
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        openLightbox(Number(trigger.dataset.index));
      });
    });

    if (openButton) {
      openButton.addEventListener("click", () => openLightbox(0));
    }

    if (closeButton) {
      closeButton.addEventListener("click", closeLightbox);
    }

    if (prevButton) {
      prevButton.addEventListener("click", () => updatePhoto(currentIndex - 1));
    }

    if (nextButton) {
      nextButton.addEventListener("click", () => updatePhoto(currentIndex + 1));
    }

    if (frame) {
      frame.addEventListener("click", (event) => event.stopPropagation());
    }

    lightbox.addEventListener("click", closeLightbox);

    document.addEventListener("keydown", (event) => {
      if (lightbox.hidden) {
        return;
      }

      if (event.key === "Escape") {
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        updatePhoto(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        updatePhoto(currentIndex + 1);
      } else if (event.key === "Tab" && frame) {
        const focusable = Array.from(frame.querySelectorAll(focusableSelector));
        if (!focusable.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function renderGalleryPage() {
    if (document.body.dataset.page !== "gallery") {
      return;
    }

    const slug = document.body.dataset.gallery;
    const gallery = galleries[slug];
    if (!gallery) {
      return;
    }

    const hero = document.querySelector("#gallery-hero");
    const title = document.querySelector("#gallery-title");
    const summary = document.querySelector("#gallery-summary");
    const count = document.querySelector("#gallery-count");
    const grid = document.querySelector("#gallery-grid");

    if (hero && gallery.heroImage) {
      const heroSource = displaySourceForPhoto(galleryLeadPhoto(gallery, gallery.heroImage)) || gallery.heroImage;
      hero.style.backgroundImage = `url("${heroSource}")`;
    }

    if (title) {
      title.textContent = gallery.title;
    }

    if (summary) {
      summary.textContent = gallery.summary;
    }

    if (count) {
      count.textContent = `${gallery.photos.length} photos`;
    }

    if (grid) {
      grid.innerHTML = "";
      gallery.photos.forEach((photo, index) => {
        grid.append(buildGalleryCard(photo, index));
      });
    }

    setupGalleryLightbox(gallery);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupNav();
    renderCounts();
    renderHome();
    renderPublications();
    setupPublicationOverview();
    setupPublicationFilters();
    renderAlbums();
    renderGalleryPage();
  });
})();
