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
      <article class="paper-card publication-entry${compact ? " paper-card--compact publication-entry--compact" : ""}" data-tags="${escapeHtml(publication.tags.join(" "))}">
        <div class="paper-card__top">
          <p class="paper-year">${escapeHtml(publication.year)}</p>
          <a class="paper-link" href="${escapeHtml(publication.link)}" target="_blank" rel="noopener">PDF</a>
        </div>
        <h3 class="paper-title">
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

  function albumMarkup(album) {
    const meta = album.meta || `${album.count} photos`;
    const contextItems = [album.location, album.dateRange, album.context].filter(Boolean);
    const summaryMarkup =
      album.summary && !contextItems.length ? `<p>${escapeHtml(album.summary)}</p>` : "";

    return `
      <article class="album-card expedition-card">
        <a class="album-card__image" href="${escapeHtml(album.link)}">
          <img src="${escapeHtml(album.image)}" alt="${escapeHtml(album.title)} album preview" loading="lazy">
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
      recentContainer.innerHTML = publicationTimelineMarkup(site.publications.slice(0, 3), true);
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
    if (!container) {
      return;
    }

    container.innerHTML = publicationTimelineMarkup(site.publications);
  }

  function setupPublicationFilters() {
    const buttons = Array.from(document.querySelectorAll("[data-filter]"));
    const cards = Array.from(document.querySelectorAll(".paper-card"));
    const groups = Array.from(document.querySelectorAll(".publication-year-group"));
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

      groups.forEach((group) => {
        const groupCards = Array.from(group.querySelectorAll(".paper-card"));
        group.hidden = groupCards.every((card) => card.hidden);
      });

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
    image.src = photo.display || photo.thumb || photo.src;
    if (photo.src && photo.display && photo.src !== photo.display) {
      image.srcset = `${photo.display} 1x, ${photo.src} 2x`;
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
      hero.style.backgroundImage = `url("${gallery.heroImage}")`;
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
    setupPublicationFilters();
    renderAlbums();
    renderGalleryPage();
  });
})();
