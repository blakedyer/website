window.addEventListener('DOMContentLoaded', () => {

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const id = entry.target.getAttribute('id');
      if (entry.isIntersecting) {
        // document.querySelector('.active').parentElement.classList.remove('active');
        document.querySelector(`div li a[href="#${id}"]`).parentElement.classList.add('active');
      } else {
        document.querySelector(`div li a[href="#${id}"]`).parentElement.classList.remove('active');
      }
    });
    threshold: [.5]
  });

  // Track all sections that have an `id` applied
  document.querySelectorAll('section[id]').forEach((section) => {
    observer.observe(section);
  });

});
